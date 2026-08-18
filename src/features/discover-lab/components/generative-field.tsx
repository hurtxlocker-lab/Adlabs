"use client";

import type { AdLibraryItem } from "@/features/ad-library/types";
import { PackedField } from "./packed-field";

interface GenerativeFieldProps {
  items: AdLibraryItem[];
}

export function GenerativeField({ items }: GenerativeFieldProps) {
  return <PackedField items={items} />;
}
