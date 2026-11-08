import Link from "next/link";
export function PublicHeader() {
  return (
    <header className="public-header">
      <Link href="/" className="brand">
        prcuisa<span>hub</span>
      </Link>
      <nav aria-label="Navigasi publik">
        <Link href="/products">PRCUISA Tools</Link>
        <Link href="/login">Masuk</Link>
        <Link className="button primary" href="/signup">
          Mulai
        </Link>
      </nav>
    </header>
  );
}
export function PublicFooter() {
  return (
    <footer className="public-footer">
      <span>PRCUISA · Build smarter systems that keep working.</span>
      <Link href="/products">PRCUISA Tools</Link>
    </footer>
  );
}
