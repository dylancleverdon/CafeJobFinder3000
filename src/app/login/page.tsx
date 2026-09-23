import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-[80dvh] flex-col justify-center">
      <div className="mb-6 text-center">
        <div className="text-5xl">☕</div>
        <h1 className="mt-2 text-2xl font-bold">Cafe Job Finder</h1>
        <p className="text-sm text-muted">Your barista job hunt, organized.</p>
      </div>
      <LoginForm next={next ?? "/"} />
    </div>
  );
}
