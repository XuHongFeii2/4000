# 自定义功能修改日志 (Custom Changelog)

本文档记录了基于开源项目 `OpenClaw` (ClawX) 的所有自定义修改。当上游项目更新时，请参考本文档重新应用修改。

## 1. 广告弹窗功能 (Ad Modal)

**功能描述**：
在软件启动（首次加载）时，自动从后端 API (`/api/ad/config`) 获取广告配置。如果有活跃的广告，则全屏显示广告弹窗。点击广告跳转到目标链接，并记录点击日志。

### 修改文件：`src/App.tsx`

**位置**：组件顶部状态定义区
```typescript
// 添加状态
const [showAd, setShowAd] = useState(false);
const [adData, setAdData] = useState<any>(null);
```

**位置**：`useEffect` 初始化逻辑中
```typescript
// 添加获取广告的逻辑
useEffect(() => {
  const checkAd = async () => {
    try {
      const response = await fetch(`${WS_URL}/api/ad/config?client_type=software`);
      if (response.ok) {
        const data = await response.json();
        if (data) {
          setAdData(data);
          setShowAd(true);
        }
      }
    } catch (error) {
      console.error('Failed to fetch ad:', error);
    }
  };
  checkAd();
  // ... 其他初始化代码
}, []);
```

**位置**：`return` JSX 渲染部分（在 `<Routes>` 之前）
```typescript
// 添加广告模态框 JSX
{showAd && adData && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
    <div className="relative bg-[#0F172A] border border-white/10 rounded-xl p-4 w-[80%] h-[80%] shadow-2xl flex flex-col items-center animate-in fade-in zoom-in duration-300">
      {/* 关闭按钮 */}
      <button 
        onClick={() => setShowAd(false)} 
        className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors z-10"
      >
        <X className="w-5 h-5" />
      </button>
      
      {/* 广告图片区域 */}
      <div 
        className="cursor-pointer w-full h-full overflow-hidden rounded-lg hover:opacity-95 transition-opacity flex items-center justify-center"
        onClick={handleAdClick}
      >
        <img 
          src={adData.image_url} 
          alt="Advertisement" 
          className="w-full h-full object-contain"
        />
      </div>
      
      <p className="text-xs text-gray-500 mt-2 absolute bottom-2">Advertisement</p>
    </div>
  </div>
)}
```

---

## 2. 使用案例展示 (Use Cases Library)

**功能描述**：
在侧边栏底部增加“使用案例”按钮。点击后弹出模态框，从后端 API (`/api/usecases`) 获取并展示所有使用案例（支持中英文切换）。

### 修改文件：`src/components/layout/Sidebar.tsx`

**位置**：Import 区域
```typescript
import { BookOpen, X } from 'lucide-react'; // 新增图标
import { WS_URL } from '@/config/app-config'; // 新增配置引用
```

**位置**：组件内部状态定义
```typescript
// Use Case State
const [showUseCases, setShowUseCases] = useState(false);
const [useCases, setUseCases] = useState<any[]>([]);

// Fetch data effect
useEffect(() => {
  if (showUseCases) {
    fetch(`${WS_URL}/api/usecases`)
      .then(res => res.json())
      .then(data => setUseCases(data))
      .catch(err => console.error(err));
  }
}, [showUseCases]);
```

**位置**：侧边栏底部按钮区域 (在折叠按钮上方)
```typescript
<div className="mt-auto px-2 space-y-1">
  <Button
    variant="ghost"
    className={cn(
      "w-full justify-start text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      sidebarCollapsed && "justify-center px-2"
    )}
    onClick={() => setShowUseCases(true)}
  >
    <BookOpen className="h-5 w-5 mr-2" />
    {!sidebarCollapsed && <span>使用案例</span>}
  </Button>
  {/* 原有的折叠按钮... */}
</div>
```

**位置**：组件最底部 (Modal JSX)
```typescript
{/* Use Cases Modal */}
{showUseCases && (
  <div className="fixed inset-0 z-[100] ...">
    {/* 模态框内容，包含 Grid 布局展示案例卡片 */}
    {/* 使用 useCases.map 渲染列表 */}
    {/* 根据 language === 'zh' 判断显示中英文 */}
  </div>
)}
```

---

## 3. Windows 安装包向导式配置

**功能描述**：
将 Windows 安装包从默认的“一键静默安装”修改为“向导式安装”，允许用户选择安装语言（中文/英文）和自定义安装路径。

### 修改文件：`electron-builder.yml`

**位置**：`nsis` 配置块
```yaml
nsis:
  oneClick: false                      # 关闭一键安装
  allowToChangeInstallationDirectory: true # 允许修改安装目录
  installerLanguages:                  # 添加多语言支持
    - zh_CN
    - en_US
  multiLanguageInstaller: true         # 启用多语言选择器
  # ... 其他原有配置
```

---

## 4. 后端 API 配置 (App Config)

**功能描述**：
确保前端能正确连接到后端 API 服务。

### 修改文件：`src/config/app-config.ts` (如果存在或新建)

确保定义了 `WS_URL` 常量指向后端服务地址（例如 `http://localhost:5000`）。

---

## 5. 在线用户统计 (WebSocket)

**功能描述**：
客户端在启动时会自动建立 WebSocket 连接到后端，用于后端实时统计在线用户数量和设备信息。

### 修改文件：`src/components/layout/Sidebar.tsx`

**位置**：Import 区域
```typescript
import { io } from 'socket.io-client'; // 引入 socket.io
```

**位置**：`Sidebar` 组件内部 `useEffect`
```typescript
useEffect(() => {
  // 建立 Socket 连接
  const socket = io(WS_URL);

  socket.on('connect', () => {
    console.log('Connected to server');
  });

  // 组件卸载时断开连接
  return () => {
    socket.disconnect();
  };
}, []);
```

---

## 6. 官网 Landing Page 修改 (Web 独立项目)

**注意**：这部分属于 `web/chinese-lobster` 项目，但也在此记录以便查阅。

### 修改文件：`src/components/LandingPage.vue`

1.  **广告拦截**：在点击下载按钮时，先请求广告配置。如果有广告，显示倒计时弹窗（3秒），倒计时结束后才允许下载。
2.  **企业微信二维码**：在“联系我们”弹窗中添加企业微信选项，悬停显示大尺寸二维码。
3.  **引用资源**：引入了 `src/assets/wechat-work.png` 图片资源。
4.  **UI 调整**：调整了弹窗尺寸为屏幕 80%，优化了悬停交互。

---

## 总结

主要修改集中在以下几个方面：
1.  **商业化功能**：应用启动广告、下载前广告。
2.  **内容运营**：使用案例库展示。
3.  **用户体验**：Windows 安装向导、多语言支持。
4.  **联系方式**：企业微信二维码悬停展示。

在合并上游更新时，请重点关注 `src/App.tsx` 和 `src/components/layout/Sidebar.tsx` 的冲突，因为这些文件通常变动较频繁。
