import type { PackedFieldSlot } from "../types/packed-field";

/**
 * Packed Field v1 Template Topology
 *
 * Single rectilinear plate consisting of 8 asymmetric regions sharing boundaries:
 *
 * ┌──────────────────── H (8 cols) ─────────────────┬──── C (4 cols) ────┐
 * │  Anchor Horizontal / Mosaic                     │  Major Portrait    │
 * ├──── D (3 cols) ───┬────── E (4 cols) ────┬─ A ─┤  Counterweight     │
 * │  Major Portrait   │  Central Mass        │ Punc│────────────────────┤
 * │  Left Mass        ├────── B (5 cols) ────┴─────┼──── F (4 cols) ────┤
 * │  (spans 2 rows)   │  South Central Support     │  East Support Band │
 * │                   │                            ├──── G (4 cols) ────┤
 * │                   │                            │  South East Support│
 * └───────────────────┴────────────────────────────┴────────────────────┘
 */
export const PACKED_FIELD_TEMPLATE_V1: PackedFieldSlot[] = [
  {
    id: "H",
    name: "Horizontal Anchor",
    weight: "anchor",
    preferredShapes: ["wide", "landscape"],
    allowsMultiVariation: true,
    alignment: {
      horizontal: "start",
      vertical: "end",
    },
    maxMediaHeightClass: "max-h-[460px]",
    maxMediaWidthClass: "w-full",
  },
  {
    id: "C",
    name: "Vertical Counterweight",
    weight: "major",
    preferredShapes: ["portrait", "square"],
    allowsMultiVariation: false,
    alignment: {
      horizontal: "end",
      vertical: "end",
    },
    maxMediaHeightClass: "max-h-[460px]",
    maxMediaWidthClass: "w-full max-w-[340px]",
  },
  {
    id: "D",
    name: "Left Vertical Mass",
    weight: "major",
    preferredShapes: ["portrait", "square"],
    allowsMultiVariation: false,
    alignment: {
      horizontal: "start",
      vertical: "start",
    },
    maxMediaHeightClass: "max-h-[620px]",
    maxMediaWidthClass: "w-full max-w-[340px]",
  },
  {
    id: "E",
    name: "Center Mass",
    weight: "major",
    preferredShapes: ["square", "portrait", "landscape"],
    allowsMultiVariation: true,
    alignment: {
      horizontal: "end",
      vertical: "start",
    },
    maxMediaHeightClass: "max-h-[420px]",
    maxMediaWidthClass: "w-full max-w-[480px]",
  },
  {
    id: "A",
    name: "Punctuation Artifact",
    weight: "punctuation",
    preferredShapes: ["square", "portrait"],
    allowsMultiVariation: false,
    alignment: {
      horizontal: "center",
      vertical: "center",
    },
    maxMediaHeightClass: "max-h-[220px]",
    maxMediaWidthClass: "w-full max-w-[220px]",
  },
  {
    id: "F",
    name: "East Support Band",
    weight: "support",
    preferredShapes: ["wide", "landscape"],
    allowsMultiVariation: true,
    alignment: {
      horizontal: "end",
      vertical: "start",
    },
    maxMediaHeightClass: "max-h-[320px]",
    maxMediaWidthClass: "w-full",
  },
  {
    id: "B",
    name: "South Central Support",
    weight: "support",
    preferredShapes: ["square", "landscape"],
    allowsMultiVariation: true,
    alignment: {
      horizontal: "start",
      vertical: "end",
    },
    maxMediaHeightClass: "max-h-[360px]",
    maxMediaWidthClass: "w-full",
  },
  {
    id: "G",
    name: "South East Support",
    weight: "support",
    preferredShapes: ["wide", "landscape"],
    allowsMultiVariation: true,
    alignment: {
      horizontal: "end",
      vertical: "end",
    },
    maxMediaHeightClass: "max-h-[340px]",
    maxMediaWidthClass: "w-full",
  },
];
