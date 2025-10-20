// 默认主页，作为 Remix 路由系统正常工作的占位符
export default function Index() {
  return (
    <div className="flex justify-center items-center h-screen bg-white">
      <h1 className="text-3xl font-bold">Welcome to the eSIM Data Check App!</h1>
    </div>
  );
}