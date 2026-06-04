export interface RoleInfo {
  id: string;
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
}

export interface UserInfo {
  id: string;
  username: string;
  email: string | null;
  full_name: string;
  is_active: boolean;
  role: RoleInfo;
  permissions: string[];
  last_login_at: string | null;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in_minutes: number;
}
