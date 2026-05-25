import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import obfuscatorPlugin from "vite-plugin-javascript-obfuscator";
// 引入 gzip 压缩插件
import viteCompression from 'vite-plugin-compression';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // 配置 gzip 压缩
    viteCompression({
      // 开启 gzip 压缩
      verbose: true, // 是否在控制台输出压缩结果（默认 true）
      disable: false, // 是否禁用压缩（默认 false）
      threshold: 10240, // 文件大小超过 10kb 才进行压缩（默认 0，即所有文件都压缩）
      algorithm: 'gzip', // 压缩算法（默认 gzip，还支持 brotliCompress）
      ext: '.gz', // 压缩文件的后缀名（默认 .gz）
      // 是否保留原始文件（默认 true，打包后会同时存在 xxx.js 和 xxx.js.gz，推荐保留）
      deleteOriginFile: false 
    }),
    // ⚠️ 建议只在生产构建启用
    obfuscatorPlugin({
      options: {
        compact: true,
        rotateStringArray: true,
        stringArray: true,
        stringArrayThreshold: 0.75,
        deadCodeInjection: false, // 通常先关掉，避免性能/调试噩梦
        debugProtection: false,   // 一般不建议开
      },
    }),
  ],
  base: './',
  build: {
    target: 'es2015', // ✅ 核心2：编译为ES5兼容语法，适配小程序X5内核低版本手机 
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    // 开启代码分割优化
    rollupOptions: {
      output: {
        // 1. 配置 chunk 分割规则
        manualChunks: {
          // 将 react、react-dom 打包成一个独立的 chunk（命名为 vendor-react）
          'vendor-react': ['react', 'react-dom'],
          // 将 axios、react-router-dom 打包成一个独立的 chunk（命名为 vendor-router-api）
          'vendor-router-api': ['axios', 'react-router-dom'],
          // （可选）将大型 UI 库（如 antd）单独打包成一个 chunk
          'vendor-antd': ['antd-mobile','antd-mobile-icons'],
          // weixin-js-sdk
          'vendor-wx-is-sdk':['weixin-js-sdk'],
        },
        // 2. 配置 chunk 文件名格式（可选，方便查看）
        chunkFileNames: 'static/js/[name]-[hash].js',
        entryFileNames: 'static/js/[name]-[hash].js',
        assetFileNames: 'static/[ext]/[name]-[hash].[ext]',
      }
    }
  }
})
