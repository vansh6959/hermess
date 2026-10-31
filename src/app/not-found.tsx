import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="liquid rim grain max-w-lg rounded-[28px] px-8 py-12 text-center">
        <p className="display-serif text-6xl text-white/85">404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          This room is empty
        </h1>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/" className="btn btn-accent">
            Back home
          </Link>
          <Link href="/search" className="btn">
            Search
          </Link>
        </div>
      </div>
    </div>
  );
}
