import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";

// Layout for every page behind the acknowledgment gate (see proxy.ts).
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 focus:outline-none sm:py-14">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
