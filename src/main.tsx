
import { createRoot } from 'react-dom/client'
import './index.css'
import Home from './home'

// 引入 vConsole
import VConsole from 'vconsole';

const vConsole = new VConsole({
  // 可选配置：自定义面板名称、主题等
  defaultPlugins: ['system', 'network', 'element', 'storage'], // 启用的插件
  maxLogNumber: 1000, // 最大日志条数
  onReady() {
    console.log('vConsole 初始化完成');
  },
});

// 显式"使用"变量，消除 TS 提示（无实际功能）
void vConsole;

createRoot(document.getElementById('root')!).render(
    <Home />
)

