import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const hasError = params.error === "1";

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 p-8">
        <h1 className="mb-1 text-2xl font-semibold text-gray-900">SyncDoc</h1>
        <p className="mb-6 text-sm text-gray-500">
          기획자와 개발자가 같은 문서를 각자의 언어로 읽고 씁니다.
        </p>
        <form action={login} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              아이디
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="username"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
              placeholder="planner 또는 developer"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
            />
          </div>
          {hasError && (
            <p className="text-sm text-red-600">
              아이디 또는 비밀번호가 올바르지 않습니다.
            </p>
          )}
          <button
            type="submit"
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            로그인
          </button>
        </form>
        <p className="mt-4 text-xs text-gray-400">
          데모 계정: planner / developer (비밀번호 demo1234)
        </p>
      </div>
    </main>
  );
}
