use super::{solana_auth, DEVICE_ID_LENGTH, TOKEN_LENGTH};
use crate::{services, utils, Error, Result, Ruma};
use ruma::{
    api::client::{
        error::ErrorKind,
        session::{get_login_types, login, logout, logout_all},
        uiaa::UserIdentifier,
    },
    events::room::message::RoomMessageEventContent,
    UserId,
};
use serde::Deserialize;
use tracing::{info, warn};

#[derive(Debug, Deserialize)]
struct Claims {
    sub: String,
    //exp: usize,
}

/// # `GET /_matrix/client/r0/login`
///
/// Get the supported login types of this server. One of these should be used as the `type` field
/// when logging in.
pub async fn get_login_types_route(
    _body: Ruma<get_login_types::v3::Request>,
) -> Result<get_login_types::v3::Response> {
    let mut types = vec![
        get_login_types::v3::LoginType::Password(Default::default()),
        get_login_types::v3::LoginType::ApplicationService(Default::default()),
    ];

    // Advertise Solana wallet authentication if enabled.
    // Clients see this in the login types response and know they can use
    // m.login.solana.signature. The nonce endpoint URL is included so clients
    // know where to request challenges.
    if services().globals.allow_solana_auth() {
        // We use _unknown for custom login types since ruma doesn't have a variant for ours.
        // Matrix clients that understand Solana auth will look for this type string.
        types.push(get_login_types::v3::LoginType::_Custom(Box::new(
            get_login_types::v3::CustomLoginType {
                type_: "m.login.solana.signature".to_owned(),
                data: Default::default(),
            },
        )));
    }

    Ok(get_login_types::v3::Response::new(types))
}

/// # `POST /_matrix/client/r0/login`
///
/// Authenticates the user and returns an access token it can use in subsequent requests.
///
/// - The user needs to authenticate using their password (or if enabled using a json web token)
/// - If `device_id` is known: invalidates old access token of that device
/// - If `device_id` is unknown: creates a new device
/// - Returns access token that is associated with the user and device
///
/// Note: You can use [`GET /_matrix/client/r0/login`](fn.get_supported_versions_route.html) to see
/// supported login types.
pub async fn login_route(body: Ruma<login::v3::Request>) -> Result<login::v3::Response> {
    // To allow deprecated login methods
    #![allow(deprecated)]

    // Check for Solana wallet authentication before the standard ruma match,
    // because ruma's LoginInfo enum doesn't include our custom login type.
    if let Some(ref json_body) = body.json_body {
        if let ruma::CanonicalJsonValue::Object(ref map) = json_body {
            if let Some(ruma::CanonicalJsonValue::String(ref login_type)) = map.get("type") {
                if login_type == "m.login.solana.signature" {
                    return handle_solana_login(&body, map).await;
                }
            }
        }
    }

    // Standard login methods
    let user_id = match &body.login_info {
        login::v3::LoginInfo::Password(login::v3::Password {
            identifier,
            password,
            user,
            address: _,
            medium: _,
        }) => {
            let user_id = if let Some(UserIdentifier::UserIdOrLocalpart(user_id)) = identifier {
                UserId::parse_with_server_name(
                    user_id.to_lowercase(),
                    services().globals.server_name(),
                )
            } else if let Some(user) = user {
                UserId::parse(user)
            } else {
                warn!("Bad login type: {:?}", &body.login_info);
                return Err(Error::BadRequest(ErrorKind::forbidden(), "Bad login type."));
            }
            .map_err(|_| Error::BadRequest(ErrorKind::InvalidUsername, "Username is invalid."))?;

            if services().appservice.is_exclusive_user_id(&user_id).await {
                return Err(Error::BadRequest(
                    ErrorKind::Exclusive,
                    "User id reserved by appservice.",
                ));
            }

            let hash = services()
                .users
                .password_hash(&user_id)?
                .ok_or(Error::BadRequest(
                    ErrorKind::forbidden(),
                    "Wrong username or password.",
                ))?;

            if hash.is_empty() {
                return Err(Error::BadRequest(
                    ErrorKind::UserDeactivated,
                    "The user has been deactivated",
                ));
            }

            let hash_matches = argon2::verify_encoded(&hash, password.as_bytes()).unwrap_or(false);

            if !hash_matches {
                return Err(Error::BadRequest(
                    ErrorKind::forbidden(),
                    "Wrong username or password.",
                ));
            }

            user_id
        }
        login::v3::LoginInfo::Token(login::v3::Token { token }) => {
            if let Some(jwt_decoding_key) = services().globals.jwt_decoding_key() {
                let token = jsonwebtoken::decode::<Claims>(
                    token,
                    jwt_decoding_key,
                    &jsonwebtoken::Validation::default(),
                )
                .map_err(|_| Error::BadRequest(ErrorKind::InvalidUsername, "Token is invalid."))?;
                let username = token.claims.sub.to_lowercase();
                let user_id =
                    UserId::parse_with_server_name(username, services().globals.server_name())
                        .map_err(|_| {
                            Error::BadRequest(ErrorKind::InvalidUsername, "Username is invalid.")
                        })?;

                if services().appservice.is_exclusive_user_id(&user_id).await {
                    return Err(Error::BadRequest(
                        ErrorKind::Exclusive,
                        "User id reserved by appservice.",
                    ));
                }

                user_id
            } else {
                return Err(Error::BadRequest(
                    ErrorKind::Unknown,
                    "Token login is not supported (server has no jwt decoding key).",
                ));
            }
        }
        login::v3::LoginInfo::ApplicationService(login::v3::ApplicationService {
            identifier,
            user,
        }) => {
            let user_id = if let Some(UserIdentifier::UserIdOrLocalpart(user_id)) = identifier {
                UserId::parse_with_server_name(
                    user_id.to_lowercase(),
                    services().globals.server_name(),
                )
            } else if let Some(user) = user {
                UserId::parse(user)
            } else {
                warn!("Bad login type: {:?}", &body.login_info);
                return Err(Error::BadRequest(ErrorKind::forbidden(), "Bad login type."));
            }
            .map_err(|_| Error::BadRequest(ErrorKind::InvalidUsername, "Username is invalid."))?;

            if let Some(ref info) = body.appservice_info {
                if !info.is_user_match(&user_id) {
                    return Err(Error::BadRequest(
                        ErrorKind::Exclusive,
                        "User is not in namespace.",
                    ));
                }
            } else {
                return Err(Error::BadRequest(
                    ErrorKind::MissingToken,
                    "Missing appservice token.",
                ));
            }

            user_id
        }
        _ => {
            warn!("Unsupported or unknown login type: {:?}", &body.login_info);
            return Err(Error::BadRequest(
                ErrorKind::Unknown,
                "Unsupported login type.",
            ));
        }
    };

    // Generate new device id if the user didn't specify one
    let device_id = body
        .device_id
        .clone()
        .unwrap_or_else(|| utils::random_string(DEVICE_ID_LENGTH).into());

    // Generate a new token for the device
    let token = utils::random_string(TOKEN_LENGTH);

    // Determine if device_id was provided and exists in the db for this user
    let device_exists = body.device_id.as_ref().is_some_and(|device_id| {
        services()
            .users
            .all_device_ids(&user_id)
            .any(|x| x.as_ref().is_ok_and(|v| v == device_id))
    });

    if device_exists {
        services().users.set_token(&user_id, &device_id, &token)?;
    } else {
        services().users.create_device(
            &user_id,
            &device_id,
            &token,
            body.initial_device_display_name.clone(),
        )?;
    }

    info!("{} logged in", user_id);

    // Homeservers are still required to send the `home_server` field
    #[allow(deprecated)]
    Ok(login::v3::Response {
        user_id,
        access_token: token,
        home_server: Some(services().globals.server_name().to_owned()),
        device_id,
        well_known: None,
        refresh_token: None,
        expires_in: None,
    })
}

/// # `POST /_matrix/client/r0/logout`
///
/// Log out the current device.
///
/// - Invalidates access token
/// - Deletes device metadata (device id, device display name, last seen ip, last seen ts)
/// - Forgets to-device events
/// - Triggers device list updates
pub async fn logout_route(body: Ruma<logout::v3::Request>) -> Result<logout::v3::Response> {
    let sender_user = body.sender_user.as_ref().expect("user is authenticated");
    let sender_device = body.sender_device.as_ref().expect("user is authenticated");

    if let Some(ref info) = body.appservice_info {
        if !info.is_user_match(sender_user) {
            return Err(Error::BadRequest(
                ErrorKind::Exclusive,
                "User is not in namespace.",
            ));
        }
    }

    services().users.remove_device(sender_user, sender_device)?;

    Ok(logout::v3::Response::new())
}

/// # `POST /_matrix/client/r0/logout/all`
///
/// Log out all devices of this user.
///
/// - Invalidates all access tokens
/// - Deletes all device metadata (device id, device display name, last seen ip, last seen ts)
/// - Forgets all to-device events
/// - Triggers device list updates
///
/// Note: This is equivalent to calling [`GET /_matrix/client/r0/logout`](fn.logout_route.html)
/// from each device of this user.
pub async fn logout_all_route(
    body: Ruma<logout_all::v3::Request>,
) -> Result<logout_all::v3::Response> {
    let sender_user = body.sender_user.as_ref().expect("user is authenticated");

    if let Some(ref info) = body.appservice_info {
        if !info.is_user_match(sender_user) {
            return Err(Error::BadRequest(
                ErrorKind::Exclusive,
                "User is not in namespace.",
            ));
        }
    } else {
        return Err(Error::BadRequest(
            ErrorKind::MissingToken,
            "Missing appservice token.",
        ));
    }

    for device_id in services().users.all_device_ids(sender_user).flatten() {
        services().users.remove_device(sender_user, &device_id)?;
    }

    Ok(logout_all::v3::Response::new())
}

/// Handle `m.login.solana.signature` login type.
///
/// Verifies the ed25519 signature from a Solana wallet, auto-creates the user account
/// if it doesn't exist, and sets the display name to the base58 address.
async fn handle_solana_login(
    body: &Ruma<login::v3::Request>,
    map: &std::collections::BTreeMap<String, ruma::CanonicalJsonValue>,
) -> Result<login::v3::Response> {
    if !services().globals.allow_solana_auth() {
        return Err(Error::BadRequest(
            ErrorKind::Unknown,
            "Solana authentication is not enabled on this server.",
        ));
    }

    // Extract the Solana-specific fields from the raw JSON body
    let get_string = |key: &str| -> Result<String> {
        match map.get(key) {
            Some(ruma::CanonicalJsonValue::String(s)) => Ok(s.clone()),
            _ => Err(Error::BadRequest(
                ErrorKind::MissingParam,
                "Missing required Solana auth field.",
            )),
        }
    };

    let solana_request = solana_auth::SolanaLoginRequest {
        address: get_string("address")?,
        signature: get_string("signature")?,
        nonce: get_string("nonce")?,
    };

    // Verify the wallet signature and get the hex localpart + base58 display name
    let (hex_localpart, base58_address) = solana_auth::verify_solana_login(&solana_request)?;

    // Build the Matrix user ID: @<64-char-hex>:server
    let user_id = UserId::parse_with_server_name(
        hex_localpart,
        services().globals.server_name(),
    )
    .map_err(|_| Error::BadRequest(ErrorKind::InvalidUsername, "Generated username is invalid."))?;

    let is_new_user = !services().users.exists(&user_id)?;

    if is_new_user {
        // Create the account with no password (wallet-only auth)
        services().users.create(&user_id, None)?;

        // Set display name to the human-readable base58 address
        services()
            .users
            .set_displayname(&user_id, Some(base58_address.clone()))?;

        // Set up default push rules
        services().account_data.update(
            None,
            &user_id,
            ruma::events::GlobalAccountDataEventType::PushRules
                .to_string()
                .into(),
            &serde_json::to_value(ruma::events::push_rules::PushRulesEvent {
                content: ruma::events::push_rules::PushRulesEventContent {
                    global: ruma::push::Ruleset::server_default(&user_id),
                },
            })
            .expect("serialization can't fail"),
        )?;

        info!("New Solana user registered: {} ({})", base58_address, user_id);

        services()
            .admin
            .send_message(RoomMessageEventContent::notice_plain(format!(
                "New Solana user {} registered ({}).",
                base58_address, user_id
            )));

        // TODO: Auto-join lobby room. For MVP, create a public room manually
        // and users will find it via the room directory. The solana_auto_join_room
        // config is reserved for future use once we wire up proper room joining.
    }

    // Generate device and token (same as standard login)
    let device_id = body
        .device_id
        .clone()
        .unwrap_or_else(|| utils::random_string(DEVICE_ID_LENGTH).into());

    let token = utils::random_string(TOKEN_LENGTH);

    let device_exists = body.device_id.as_ref().is_some_and(|device_id| {
        services()
            .users
            .all_device_ids(&user_id)
            .any(|x| x.as_ref().is_ok_and(|v| v == device_id))
    });

    if device_exists {
        services().users.set_token(&user_id, &device_id, &token)?;
    } else {
        services().users.create_device(
            &user_id,
            &device_id,
            &token,
            body.initial_device_display_name.clone(),
        )?;
    }

    info!("{} logged in via Solana wallet", user_id);

    #[allow(deprecated)]
    Ok(login::v3::Response {
        user_id,
        access_token: token,
        home_server: Some(services().globals.server_name().to_owned()),
        device_id,
        well_known: None,
        refresh_token: None,
        expires_in: None,
    })
}

// Auto-join will be implemented in v2 using the membership service.
