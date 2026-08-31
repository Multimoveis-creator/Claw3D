import {
  ATM_MIGRATION_KEY,
  GYM_ROOM_MIGRATION_KEY,
  PHONE_BOOTH_MIGRATION_KEY,
  QA_LAB_MIGRATION_KEY,
  SMS_BOOTH_MIGRATION_KEY,
  SERVER_ROOM_MIGRATION_KEY,
  STORAGE_KEY,
} from "@/features/retro-office/core/constants";
import { ensurePersonalOfficeWing } from "@/features/retro-office/core/personalOffices";
import type { FurnitureItem } from "@/features/retro-office/core/types";

export const ACTIVE_OFFICE_LAYOUT_NAMESPACE_KEY =
  "claw3d-active-office-layout-namespace-v1";

const resolveStorageKey = (key: string, namespace = "default") =>
  namespace === "default" ? key : `${key}:${namespace}`;

const markActiveLayoutNamespace = (namespace: string) => {
  try {
    localStorage.setItem(ACTIVE_OFFICE_LAYOUT_NAMESPACE_KEY, namespace);
  } catch {
    /* ignore */
  }
};

export const readActiveLayoutNamespace = (): string => {
  try {
    return localStorage.getItem(ACTIVE_OFFICE_LAYOUT_NAMESPACE_KEY) || "default";
  } catch {
    return "default";
  }
};

const hasStorageFlag = (key: string, namespace = "default") => {
  try {
    return localStorage.getItem(resolveStorageKey(key, namespace)) === "1";
  } catch {
    return false;
  }
};

const markStorageFlag = (key: string, namespace = "default") => {
  try {
    localStorage.setItem(resolveStorageKey(key, namespace), "1");
  } catch {
    /* ignore */
  }
};

export const saveFurniture = (items: FurnitureItem[], namespace = "default") => {
  try {
    markActiveLayoutNamespace(namespace);
    const normalizedItems = ensurePersonalOfficeWing(items);
    localStorage.setItem(
      resolveStorageKey(STORAGE_KEY, namespace),
      JSON.stringify(normalizedItems),
    );
  } catch {
    /* ignore */
  }
};

export const loadFurniture = (namespace = "default"): FurnitureItem[] | null => {
  try {
    markActiveLayoutNamespace(namespace);
    const raw = localStorage.getItem(resolveStorageKey(STORAGE_KEY, namespace));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0
      ? ensurePersonalOfficeWing(parsed as FurnitureItem[])
      : null;
  } catch {
    return null;
  }
};

export const loadActiveFurniture = (): FurnitureItem[] | null =>
  loadFurniture(readActiveLayoutNamespace());

export const hasAtmMigrationApplied = (namespace = "default") =>
  hasStorageFlag(ATM_MIGRATION_KEY, namespace);

export const markAtmMigrationApplied = (namespace = "default") => {
  markStorageFlag(ATM_MIGRATION_KEY, namespace);
};

export const hasServerRoomMigrationApplied = (namespace = "default") =>
  hasStorageFlag(SERVER_ROOM_MIGRATION_KEY, namespace);

export const markServerRoomMigrationApplied = (namespace = "default") => {
  markStorageFlag(SERVER_ROOM_MIGRATION_KEY, namespace);
};

export const hasGymRoomMigrationApplied = (namespace = "default") =>
  hasStorageFlag(GYM_ROOM_MIGRATION_KEY, namespace);

export const markGymRoomMigrationApplied = (namespace = "default") => {
  markStorageFlag(GYM_ROOM_MIGRATION_KEY, namespace);
};

export const hasQaLabMigrationApplied = (namespace = "default") =>
  hasStorageFlag(QA_LAB_MIGRATION_KEY, namespace);

export const markQaLabMigrationApplied = (namespace = "default") => {
  markStorageFlag(QA_LAB_MIGRATION_KEY, namespace);
};

export const hasPhoneBoothMigrationApplied = (namespace = "default") =>
  hasStorageFlag(PHONE_BOOTH_MIGRATION_KEY, namespace);

export const markPhoneBoothMigrationApplied = (namespace = "default") => {
  markStorageFlag(PHONE_BOOTH_MIGRATION_KEY, namespace);
};

export const hasSmsBoothMigrationApplied = (namespace = "default") =>
  hasStorageFlag(SMS_BOOTH_MIGRATION_KEY, namespace);

export const markSmsBoothMigrationApplied = (namespace = "default") => {
  markStorageFlag(SMS_BOOTH_MIGRATION_KEY, namespace);
};
