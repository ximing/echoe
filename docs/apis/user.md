# User API

用户信息管理相关接口

## Base URL

`/api/v1/user`

## Endpoints

### Get User Info - 获取用户信息

```http
GET /api/v1/user/info
```

**请求头**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Authorization | string | 是 | Bearer Token |

**请求体类型 (TypeScript)**

```typescript
// 无请求参数，通过 JWT Token 中的 @CurrentUser 获取当前用户
```

**响应体类型 (TypeScript)**

```typescript
interface UserInfoDto {
  /** 用户唯一标识符 */
  uid: string;
  /** 用户邮箱 */
  email?: string;
  /** 用户昵称 */
  nickname?: string;
  /** 用户头像 URL */
  avatar?: string;
}

interface ResponseData<T> {
  code: number;
  msg: string;
  data: T;
}

type GetUserInfoResponse = ResponseData<UserInfoDto>;
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "uid": "user_xxx",
    "email": "test@example.com",
    "nickname": "Test User",
    "avatar": "https://..."
  }
}
```

---

### Update User Info - 更新用户信息

```http
PUT /api/v1/user/info
```

**请求头**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Authorization | string | 是 | Bearer Token |

**请求体类型 (TypeScript)**

```typescript
interface UpdateUserDto {
  /** 用户昵称 */
  nickname?: string;
  /** 用户头像 URL */
  avatar?: string;
}
```

**响应体类型 (TypeScript)**

```typescript
interface UserInfoDto {
  /** 用户唯一标识符 */
  uid: string;
  /** 用户邮箱 */
  email?: string;
  /** 用户昵称 */
  nickname?: string;
  /** 用户头像 URL */
  avatar?: string;
}

interface UpdateUserResponseData {
  message: string;
  user: UserInfoDto;
}

interface ResponseData<T> {
  code: number;
  msg: string;
  data: T;
}

type UpdateUserResponse = ResponseData<UpdateUserResponseData>;
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| nickname | string | 否 | 昵称 |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "message": "User info updated successfully",
    "user": {
      "uid": "user_xxx",
      "email": "test@example.com",
      "nickname": "New Name"
    }
  }
}
```

---

### Change Password - 修改密码

```http
POST /api/v1/user/password
```

**请求头**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Authorization | string | 是 | Bearer Token |

**请求体类型 (TypeScript)**

```typescript
interface ChangePasswordDto {
  /** 当前密码 */
  oldPassword: string;
  /** 新密码 */
  newPassword: string;
}
```

**响应体类型 (TypeScript)**

```typescript
interface ChangePasswordResponseData {
  message: string;
}

interface ResponseData<T> {
  code: number;
  msg: string;
  data: T;
}

type ChangePasswordResponse = ResponseData<ChangePasswordResponseData>;
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| oldPassword | string | 是 | 旧密码 |
| newPassword | string | 是 | 新密码（至少6位） |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "message": "Password changed successfully"
  }
}
```

---

### Upload Avatar - 上传头像

```http
POST /api/v1/user/avatar
```

**Content-Type**: `multipart/form-data`

**请求头**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Authorization | string | 是 | Bearer Token |

**请求体类型 (TypeScript)**

```typescript
// 表单字段
interface UploadAvatarFormData {
  /** 头像图片文件 */
  avatar: File;
}
```

**响应体类型 (TypeScript)**

```typescript
interface UploadAvatarResponseData {
  message: string;
  /** 头像访问 URL */
  avatar: string;
}

interface ResponseData<T> {
  code: number;
  msg: string;
  data: T;
}

type UploadAvatarResponse = ResponseData<UploadAvatarResponseData>;
```

**表单字段**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| avatar | file | 是 | 头像图片文件 |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "message": "Avatar uploaded successfully",
    "avatar": "https://..."
  }
}
```
