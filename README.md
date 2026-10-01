# Tidy — 桌面可视化导航器

以**悬浮收纳框**的方式管理桌面快捷方式、文件和文件夹引用。

**只做引用，不移动、不修改你的任何原始文件。**

## 功能

- 🪟 透明无边框毛玻璃悬浮框，折叠（图标预览）/ 展开（列表）两种形态
- 📥 拖入 `.lnk` / `.url` / 文件 / 文件夹即可添加，原文件零改动
- 🎨 折叠态显示前 6 个图标 + 溢出计数，展开态可拖拽排序
- 🔍 托盘菜单一键扫描桌面快捷方式，批量导入
- 🖥️ 系统托盘常驻：新建收纳框、显示 / 隐藏 / 删除
- 📌 窗口位置持久化，自动裁切防止跑出屏幕
- 🎮 Steam / TapTap 游戏 `.url` 快捷方式图标提取
- 🔄 开机自启（Startup 文件夹 .vbs 方案，不走注册表）

## 技术栈

Electron 30 + React 18 + TypeScript + Tailwind CSS + Framer Motion + Zustand + Vite

## 开发

```bash
npm install
npm run dev     # 开发运行
npm run build   # 构建
```

## 打包

```bash
npx electron-builder
```

输出 Windows 便携版到 `release/`。

## 目录结构

```
electron/
  main.ts          # 主进程：IPC、数据持久化、自启、图标提取、.lnk/.url 解析
  box-window.ts    # 收纳框窗口创建、位置裁切、展开/折叠
  preload.ts       # contextBridge 暴露 IPC API
src/
  components/      # 收纳框 UI、展开面板、图标预览、添加对话框
  store/useStore.ts# Zustand：collections / items CRUD
  types/           # 类型定义
assets/            # 应用图标
```

## 平台

目前仅面向 **Windows**（依赖 `.lnk` / `.url` 解析与 Startup 自启机制）。

## License

[MIT](LICENSE)
