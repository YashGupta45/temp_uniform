import axios, { AxiosInstance } from "axios";

import { storage } from "@/src/utils/storage";

export const TOKEN_KEY = "fabric_auth_token";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";

export const api: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 30000,
});

// Attach latest token on every request.
api.interceptors.request.use(async (config) => {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  if (token) {
    config.headers = config.headers || {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

export type LoginPayload = { email: string; password: string };
export type UserPublic = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "employee";
  is_active: boolean;
  created_at: string;
};

export type Catalog = {
  id: string;
  name: string;
  brand: string;
  manufacturer: string;
  year?: number | null;
  season: string;
  description: string;
  cover_image?: string | null;
  design_count: number;
  created_at: string;
};

export type Design = {
  id: string;
  design_number: string;
  catalog_id: string;
  catalog_name: string;
  brand: string;
  page_number?: number | null;
  color: string;
  pattern: string;
  tags: string[];
  remarks: string;
  image: string;
  thumbnail: string;
  created_at: string;
};

export type DesignSearchResult = {
  id: string;
  design_number: string;
  catalog_id: string;
  catalog_name: string;
  brand: string;
  page_number?: number | null;
  color: string;
  pattern: string;
  tags: string[];
  remarks: string;
  thumbnail: string;
  similarity: number;
};

export type RecentSearch = {
  id: string;
  query_type: "image" | "text";
  query_text: string;
  thumbnail: string;
  top_design_id?: string | null;
  top_similarity: number;
  created_at: string;
};

export type DashboardStats = {
  users: number;
  catalogs: number;
  designs: number;
  searches_last_7d: number;
  duplicates_estimate: number;
  storage_bytes: number;
};

export type DuplicatePair = {
  design_a_id: string;
  design_a_number: string;
  design_a_thumb: string;
  design_b_id: string;
  design_b_number: string;
  design_b_thumb: string;
  similarity: number;
};
