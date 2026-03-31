# 数据库架构更新文档

<cite>
**本文档中引用的文件**
- [schema.sql](file://supabase/schema.sql)
- [supabase-server.ts](file://lib/supabase-server.ts)
- [types.ts](file://lib/types.ts)
- [auth.ts](file://lib/auth.ts)
- [sms.ts](file://lib/sms.ts)
- [project-service.ts](file://lib/project-service.ts)
- [storage-service.ts](file://lib/storage-service.ts)
- [route.ts](file://app/api/auth/me/route.ts)
- [route.ts](file://app/api/projects/route.ts)
- [route.ts](file://app/api/projects/[id]/route.ts)
- [route.ts](file://app/api/projects/[id]/save/route.ts)
- [route.ts](file://app/api/auth/signin-sms/route.ts)
- [route.ts](file://app/api/auth/signup/route.ts)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构概览](#项目结构概览)
3. [核心数据库架构](#核心数据库架构)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能考虑](#性能考虑)
8. [故障排除指南](#故障排除指南)
9. [结论](#结论)

## 简介

Loveart 是一个基于 Next.js 和 Supabase 的数字艺术创作平台。本项目专注于数据库架构的现代化升级，特别是从传统的 JSONB 快照存储迁移到基于 Supabase Storage 的文件存储系统。本次更新实现了更高效的数据存储、更好的可扩展性和更强的系统稳定性。

## 项目结构概览

项目采用现代全栈架构设计，主要分为以下几个层次：

```mermaid
graph TB
subgraph "前端层"
UI[React 组件]
Store[Zustand 状态管理]
Services[业务服务层]
end
subgraph "API 层"
AuthAPI[认证 API]
ProjectAPI[项目 API]
UploadAPI[上传 API]
end
subgraph "服务层"
Supabase[Supabase 数据库]
Storage[Supabase Storage]
Auth[身份认证]
end
UI --> Services
Services --> AuthAPI
Services --> ProjectAPI
Services --> UploadAPI
AuthAPI --> Supabase
ProjectAPI --> Supabase
UploadAPI --> Storage
AuthAPI --> Auth
```

**图表来源**
- [supabase-server.ts:1-29](file://lib/supabase-server.ts#L1-L29)
- [storage-service.ts:1-324](file://lib/storage-service.ts#L1-L324)

**章节来源**
- [supabase-server.ts:1-29](file://lib/supabase-server.ts#L1-L29)
- [storage-service.ts:1-324](file://lib/storage-service.ts#L1-L324)

## 核心数据库架构

### 数据库表结构

系统采用 PostgreSQL 作为主数据库，结合 Supabase 的强大功能实现完整的数据管理：

```mermaid
erDiagram
USERS {
uuid id PK
varchar phone UK
varchar password_hash
varchar nickname
text avatar_url
timestamptz created_at
}
VERIFICATION_CODES {
uuid id PK
varchar phone
varchar code
timestamptz expires_at
boolean used
timestamptz created_at
}
PROJECTS {
uuid id PK
uuid user_id FK
varchar name
text thumbnail_url
text snapshot_url
timestamptz created_at
timestamptz updated_at
}
PROJECT_SNAPSHOTS {
uuid id PK
uuid project_id FK
jsonb snapshot
integer version
timestamptz created_at
}
USERS ||--o{ PROJECTS : "拥有"
PROJECTS ||--o{ PROJECT_SNAPSHOTS : "包含"
```

**图表来源**
- [schema.sql:1-51](file://supabase/schema.sql#L1-L51)

### 关键特性

1. **用户管理系统**: 支持手机号登录和传统密码登录
2. **项目存储**: 采用混合存储策略（新版本使用 Storage，旧版本兼容 JSONB）
3. **验证码系统**: 集成短信验证功能
4. **权限控制**: 基于用户 ID 的严格访问控制

**章节来源**
- [schema.sql:1-51](file://supabase/schema.sql#L1-L51)
- [types.ts:51-85](file://lib/types.ts#L51-L85)

## 架构总览

系统采用分层架构设计，确保各组件职责清晰、耦合度低：

```mermaid
graph TD
subgraph "客户端层"
Browser[浏览器]
React[React 应用]
end
subgraph "API 网关层"
AuthRoutes[认证路由]
ProjectRoutes[项目路由]
UploadRoutes[上传路由]
end
subgraph "业务逻辑层"
AuthService[认证服务]
ProjectService[项目服务]
StorageService[存储服务]
end
subgraph "数据持久层"
SupabaseDB[Supabase 数据库]
StorageBucket[Storage 桶]
end
Browser --> React
React --> AuthRoutes
React --> ProjectRoutes
React --> UploadRoutes
AuthRoutes --> AuthService
ProjectRoutes --> ProjectService
UploadRoutes --> StorageService
AuthService --> SupabaseDB
ProjectService --> SupabaseDB
ProjectService --> StorageBucket
StorageService --> StorageBucket
```

**图表来源**
- [auth.ts:1-64](file://lib/auth.ts#L1-L64)
- [project-service.ts:1-225](file://lib/project-service.ts#L1-L225)
- [storage-service.ts:1-324](file://lib/storage-service.ts#L1-L324)

## 详细组件分析

### 认证系统

认证系统支持多种登录方式，确保用户体验和安全性的平衡：

```mermaid
sequenceDiagram
participant Client as 客户端
participant AuthAPI as 认证 API
participant SMSService as 短信服务
participant DB as Supabase 数据库
participant JWT as JWT 服务
Client->>AuthAPI : POST /api/auth/signin-sms
AuthAPI->>SMSService : 验证验证码
SMSService->>DB : 查询验证码
DB-->>SMSService : 验证结果
SMSService-->>AuthAPI : 验证通过
AuthAPI->>DB : 查询/创建用户
DB-->>AuthAPI : 用户信息
AuthAPI->>JWT : 生成 JWT
JWT-->>AuthAPI : Token
AuthAPI-->>Client : 登录成功
```

**图表来源**
- [route.ts:1-94](file://app/api/auth/signin-sms/route.ts#L1-L94)
- [sms.ts:43-115](file://lib/sms.ts#L43-L115)
- [auth.ts:13-28](file://lib/auth.ts#L13-L28)

### 项目管理系统

项目管理系统实现了从简单 CRUD 操作到复杂快照存储的完整生命周期管理：

```mermaid
flowchart TD
Start([开始保存流程]) --> ValidateInput[验证输入参数]
ValidateInput --> CheckSnapshot{存在快照?}
CheckSnapshot --> |否| ReturnError[返回错误]
CheckSnapshot --> |是| ProcessAssets[处理图片资源]
ProcessAssets --> ExtractAssets[提取快照中的图片资产]
ExtractAssets --> CheckAssetType{资产类型检查}
CheckAssetType --> |Base64| UploadAsset[上传到 Storage]
CheckAssetType --> |URL| SkipUpload[跳过上传]
UploadAsset --> UpdateAssetURL[更新资产 URL]
SkipUpload --> ContinueProcess[继续处理]
UpdateAssetURL --> UploadSnapshot[上传快照到 Storage]
ContinueProcess --> UploadSnapshot
UploadSnapshot --> UpdateProject[更新项目记录]
UpdateProject --> ReturnSuccess[返回成功]
ReturnError --> End([结束])
ReturnSuccess --> End
```

**图表来源**
- [route.ts:55-194](file://app/api/projects/[id]/save/route.ts#L55-L194)
- [storage-service.ts:122-157](file://lib/storage-service.ts#L122-L157)

### 存储服务架构

存储服务采用了双桶架构，分别处理公共资源和私有资源：

```mermaid
classDiagram
class StorageService {
+uploadAsset(userId, assetId, base64Data) Promise~string~
+uploadSnapshot(userId, projectId, snapshot) Promise~string~
+fetchSnapshot(snapshotPath) Promise~Object~
+deleteProjectStorage(userId, projectId) Promise~void~
+deleteAssets(userId, assetIds) Promise~void~
}
class AssetBucket {
+name : "canvas-assets"
+publicAccess : true
+fileSizeLimit : 10MB
+allowedTypes : "image/*"
}
class SnapshotBucket {
+name : "canvas-snapshots"
+publicAccess : false
+fileSizeLimit : 50MB
+allowedTypes : "application/json"
}
class SupabaseAdmin {
+storage : StorageClient
+from(table) QueryBuilder
}
StorageService --> AssetBucket : 使用
StorageService --> SnapshotBucket : 使用
StorageService --> SupabaseAdmin : 依赖
```

**图表来源**
- [storage-service.ts:1-324](file://lib/storage-service.ts#L1-L324)
- [supabase-server.ts:1-29](file://lib/supabase-server.ts#L1-L29)

**章节来源**
- [auth.ts:1-64](file://lib/auth.ts#L1-L64)
- [project-service.ts:1-225](file://lib/project-service.ts#L1-L225)
- [storage-service.ts:1-324](file://lib/storage-service.ts#L1-L324)

## 依赖关系分析

系统各组件之间的依赖关系清晰明确，遵循单一职责原则：

```mermaid
graph LR
subgraph "核心依赖"
SupabaseJS["@supabase/supabase-js"]
JWTLib["jose"]
Bcrypt["bcryptjs"]
end
subgraph "业务模块"
AuthModule[认证模块]
ProjectModule[项目模块]
StorageModule[存储模块]
SMSModule[短信模块]
end
subgraph "工具模块"
Utils[工具函数]
Types[类型定义]
end
SupabaseJS --> AuthModule
SupabaseJS --> ProjectModule
SupabaseJS --> StorageModule
JWTLib --> AuthModule
Bcrypt --> AuthModule
AuthModule --> Utils
ProjectModule --> Utils
StorageModule --> Utils
SMSModule --> Utils
Types --> AllModules[所有模块]
```

**图表来源**
- [package.json:11-35](file://package.json#L11-L35)
- [supabase-server.ts:1-29](file://lib/supabase-server.ts#L1-L29)

**章节来源**
- [package.json:1-54](file://package.json#L1-L54)
- [supabase-server.ts:1-29](file://lib/supabase-server.ts#L1-L29)

## 性能考虑

### 存储优化策略

1. **分层存储架构**: 将公共资源和私有资源分离到不同存储桶
2. **索引优化**: 为常用查询字段建立复合索引
3. **缓存策略**: 利用 Supabase 的内置缓存机制
4. **异步处理**: 大文件上传采用异步处理模式

### 查询性能优化

```mermaid
flowchart TD
QueryStart[查询开始] --> CheckIndex{检查索引}
CheckIndex --> |存在| UseIndex[使用索引查询]
CheckIndex --> |不存在| CreateIndex[创建索引]
UseIndex --> OptimizeQuery[优化查询条件]
CreateIndex --> OptimizeQuery
OptimizeQuery --> LimitResults[限制结果集大小]
LimitResults --> ReturnResults[返回结果]
CreateIndex --> MonitorPerformance[监控性能]
MonitorPerformance --> OptimizeQuery
```

**章节来源**
- [schema.sql:21-24](file://supabase/schema.sql#L21-L24)
- [schema.sql:48-50](file://supabase/schema.sql#L48-L50)

## 故障排除指南

### 常见问题及解决方案

1. **环境变量配置错误**
   - 检查 `NEXT_PUBLIC_SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`
   - 确认环境变量在部署环境中正确设置

2. **存储权限问题**
   - 验证 Storage 桶的访问权限设置
   - 检查服务角色密钥的有效性

3. **认证失败**
   - 验证 JWT 密钥配置
   - 检查用户会话状态

**章节来源**
- [supabase-server.ts:10-28](file://lib/supabase-server.ts#L10-L28)
- [storage-service.ts:1-17](file://lib/storage-service.ts#L1-L17)

## 结论

本次数据库架构更新成功实现了从传统 JSONB 存储到现代文件存储系统的迁移。新架构具有以下优势：

1. **更好的可扩展性**: 支持更大规模的数据存储需求
2. **更高的性能**: 优化的存储结构和查询机制
3. **更强的安全性**: 分离的存储权限管理和访问控制
4. **更易维护**: 清晰的架构设计和模块化组织

通过这次更新，Loveart 平台为未来的功能扩展和技术演进奠定了坚实的基础。