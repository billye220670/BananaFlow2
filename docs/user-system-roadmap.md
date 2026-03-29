# 用户系统开发路线图

## 当前状态 ✅
- 手机号注册/登录/退出 已完成
- Vercel 部署环境变量配置完成

---

## Phase 1: 头像昵称系统（当前）

### 目标
让用户有"这是我的账号"的归属感

### 功能清单
1. **注册流程扩展**
   - 注册时填写昵称（必填）
   - 头像先用默认占位图

2. **TopBar 用户菜单**
   - 显示昵称 + 头像
   - 下拉菜单：个人资料 / 退出登录

3. **个人资料页** (`/profile`)
   - 修改昵称
   - 上传头像（Supabase Storage）

### 技术点
- 扩展 `users` 表：添加 `nickname`, `avatar_url`
- Supabase Storage bucket: `avatars`
- 文件上传组件

---

## Phase 2: 第三方登录（后续）

### 优先级
1. Google 登录（海外用户，配置简单）
2. 微信登录（国内用户，需资质）

---

## 关键决策

### 头像方案
- [ ] 本地上传（Supabase Storage）
- [ ] 等 Google 登录时用 Google 头像

### 数据库变更
```sql
-- users 表需添加
ALTER TABLE users ADD COLUMN nickname VARCHAR(50);
ALTER TABLE users ADD COLUMN avatar_url TEXT;
```

---

## 文件位置
- 用户认证: `app/api/auth/*`
- 用户状态: `lib/store.ts`
- Supabase 客户端: `lib/supabase-server.ts`
- TopBar: `components/canvas/TopBar.tsx`
