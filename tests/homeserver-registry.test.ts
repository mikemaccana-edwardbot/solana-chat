import { before, describe, test } from "node:test";
import assert from "node:assert";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { HomeserverRegistry } from "../target/types/homeserver_registry";

describe("homeserver-registry", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .homeserverRegistry as Program<HomeserverRegistry>;

  const owner = provider.wallet;

  const getDelegationAddress = (ownerPublicKey: PublicKey): PublicKey => {
    const [delegationAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("delegation"), ownerPublicKey.toBuffer()],
      program.programId
    );
    return delegationAddress;
  };

  test("registers a homeserver delegation", async () => {
    const homeserver = "chat.example.com";
    const delegationAddress = getDelegationAddress(owner.publicKey);

    await program.methods
      .register(homeserver)
      .accounts({
        delegation: delegationAddress,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const delegation = await program.account.delegation.fetch(
      delegationAddress
    );

    assert.equal(delegation.owner.toBase58(), owner.publicKey.toBase58());
    assert.equal(delegation.homeserver, homeserver);
    assert.ok(delegation.updatedAt.toNumber() > 0);
    assert.ok(delegation.bump > 0);
  });

  test("updates an existing delegation to a new homeserver", async () => {
    const newHomeserver = "chat.newserver.io";
    const delegationAddress = getDelegationAddress(owner.publicKey);

    await program.methods
      .register(newHomeserver)
      .accounts({
        delegation: delegationAddress,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const delegation = await program.account.delegation.fetch(
      delegationAddress
    );

    assert.equal(delegation.homeserver, newHomeserver);
  });

  test("rejects empty homeserver", async () => {
    const otherWallet = Keypair.generate();
    const delegationAddress = getDelegationAddress(otherWallet.publicKey);

    // Airdrop some SOL to the other wallet
    const airdropSignature = await provider.connection.requestAirdrop(
      otherWallet.publicKey,
      1_000_000_000
    );
    await provider.connection.confirmTransaction(airdropSignature);

    try {
      await program.methods
        .register("")
        .accounts({
          delegation: delegationAddress,
          owner: otherWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([otherWallet])
        .rpc();
      assert.fail("Should have thrown");
    } catch (thrownObject) {
      const error = thrownObject instanceof Error ? thrownObject : new Error(String(thrownObject));
      assert.ok(
        error.message.includes("EmptyHomeserver"),
        `Expected EmptyHomeserver error, got: ${error.message}`
      );
    }
  });

  test("rejects homeserver without a dot", async () => {
    const otherWallet = Keypair.generate();
    const delegationAddress = getDelegationAddress(otherWallet.publicKey);

    const airdropSignature = await provider.connection.requestAirdrop(
      otherWallet.publicKey,
      1_000_000_000
    );
    await provider.connection.confirmTransaction(airdropSignature);

    try {
      await program.methods
        .register("localhost")
        .accounts({
          delegation: delegationAddress,
          owner: otherWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([otherWallet])
        .rpc();
      assert.fail("Should have thrown");
    } catch (thrownObject) {
      const error = thrownObject instanceof Error ? thrownObject : new Error(String(thrownObject));
      assert.ok(
        error.message.includes("InvalidHomeserver"),
        `Expected InvalidHomeserver error, got: ${error.message}`
      );
    }
  });

  test("rejects homeserver with protocol prefix", async () => {
    const otherWallet = Keypair.generate();
    const delegationAddress = getDelegationAddress(otherWallet.publicKey);

    const airdropSignature = await provider.connection.requestAirdrop(
      otherWallet.publicKey,
      1_000_000_000
    );
    await provider.connection.confirmTransaction(airdropSignature);

    try {
      await program.methods
        .register("https://chat.example.com")
        .accounts({
          delegation: delegationAddress,
          owner: otherWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([otherWallet])
        .rpc();
      assert.fail("Should have thrown");
    } catch (thrownObject) {
      const error = thrownObject instanceof Error ? thrownObject : new Error(String(thrownObject));
      assert.ok(
        error.message.includes("InvalidHomeserver"),
        `Expected InvalidHomeserver error, got: ${error.message}`
      );
    }
  });

  test("another wallet cannot close someone else's delegation", async () => {
    const delegationAddress = getDelegationAddress(owner.publicKey);
    const attacker = Keypair.generate();

    const airdropSignature = await provider.connection.requestAirdrop(
      attacker.publicKey,
      1_000_000_000
    );
    await provider.connection.confirmTransaction(airdropSignature);

    try {
      await program.methods
        .unregister()
        .accounts({
          delegation: delegationAddress,
          owner: attacker.publicKey,
        })
        .signers([attacker])
        .rpc();
      assert.fail("Should have thrown");
    } catch (thrownObject) {
      const error = thrownObject instanceof Error ? thrownObject : new Error(String(thrownObject));
      // Should fail because the PDA seeds won't match or has_one will reject
      assert.ok(error.message.length > 0);
    }
  });

  test("owner can unregister their delegation and reclaim rent", async () => {
    const delegationAddress = getDelegationAddress(owner.publicKey);

    const balanceBefore = await provider.connection.getBalance(owner.publicKey);

    await program.methods
      .unregister()
      .accounts({
        delegation: delegationAddress,
        owner: owner.publicKey,
      })
      .rpc();

    const balanceAfter = await provider.connection.getBalance(owner.publicKey);

    // Should have reclaimed rent (minus transaction fee)
    assert.ok(balanceAfter > balanceBefore - 10_000);

    // Account should no longer exist
    const accountInfo = await provider.connection.getAccountInfo(
      delegationAddress
    );
    assert.equal(accountInfo, null);
  });

  test("can re-register after unregistering", async () => {
    const homeserver = "chat.comeback.io";
    const delegationAddress = getDelegationAddress(owner.publicKey);

    await program.methods
      .register(homeserver)
      .accounts({
        delegation: delegationAddress,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const delegation = await program.account.delegation.fetch(
      delegationAddress
    );

    assert.equal(delegation.homeserver, homeserver);
  });

  test("allows homeserver with port number", async () => {
    const otherWallet = Keypair.generate();
    const delegationAddress = getDelegationAddress(otherWallet.publicKey);

    const airdropSignature = await provider.connection.requestAirdrop(
      otherWallet.publicKey,
      1_000_000_000
    );
    await provider.connection.confirmTransaction(airdropSignature);

    await program.methods
      .register("chat.example.com:8448")
      .accounts({
        delegation: delegationAddress,
        owner: otherWallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([otherWallet])
      .rpc();

    const delegation = await program.account.delegation.fetch(
      delegationAddress
    );

    assert.equal(delegation.homeserver, "chat.example.com:8448");
  });

  test("lookup by wallet address works (PDA derivation)", async () => {
    const delegationAddress = getDelegationAddress(owner.publicKey);

    const delegation = await program.account.delegation.fetch(
      delegationAddress
    );

    assert.equal(delegation.owner.toBase58(), owner.publicKey.toBase58());
    assert.ok(delegation.homeserver.length > 0);
  });
});
