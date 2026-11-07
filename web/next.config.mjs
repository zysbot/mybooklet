/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pg"],
  // 主辦方附加文宣的檔案上限是 4 MB（Vercel 的請求上限是 4.5 MB）
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  webpack(config) {
    // pdf.js 只在後台的瀏覽器裡用；它在 Node 環境才會找的 canvas 套件不需要打包
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
