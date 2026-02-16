interface StatusScreenProps {
  message: string;
}

export function StatusScreen({ message }: StatusScreenProps) {
  return (
    <section className="status-screen">
      <p className="status-message">{message}</p>
    </section>
  );
}
