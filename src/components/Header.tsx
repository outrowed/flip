import { Link } from "react-router-dom";

export function Header() {
    return (
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[#202736] bg-[#0f131a] px-6 py-4 sm:px-8">
            <Link to="/" className="flex items-center gap-3.5 no-underline" aria-label="FLIP home">
                <img src="/logo.svg" alt="" width={68} height={32} className="block shrink-0" />
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-[#f1f5f9]">
                        FLIP
                    </h1>
                    <p className="text-xs text-[#94a3b8]">
                        Flip-dot Letter &amp; Image Playground
                    </p>
                </div>
            </Link>
        </header>
    );
}

export default Header;
