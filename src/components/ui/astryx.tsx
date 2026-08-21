"use client";

/**
 * AdLabs UI adapter — the ONLY module allowed to import Astryx primitives.
 *
 * Astryx provides interaction behavior (layers, focus management, keyboard
 * navigation, ARIA semantics) and structural CSS only. Every visible token is
 * mapped to AdLabs values by the `.adlabs-astryx` scope defined in
 * src/app/globals.css, and components accept className for Tailwind styling.
 *
 * Rollback boundary: replacing the implementations behind this file (or
 * reverting this file) must require no change anywhere else in the app.
 *
 * Modules that must NEVER import Astryx directly:
 *   - src/discovery/ (filters, projection)
 *   - src/app/discover/page.tsx
 *   - src/features/discover/utils/url-filters.ts
 */

import { CheckboxList, CheckboxListItem } from "@astryxdesign/core/CheckboxList";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { Popover, usePopover } from "@astryxdesign/core/Popover";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import {
  useFocusTrap,
  useListFocus,
  useTypeahead,
} from "@astryxdesign/core/hooks";

export {
  CheckboxList,
  CheckboxListItem,
  MultiSelector,
  Popover,
  Selector,
  Switch,
  useFocusTrap,
  useListFocus,
  usePopover,
  useTypeahead,
};

/**
 * Astryx interaction scope.
 *
 * Applies the neutral theme token set and the AdLabs token mapping to every
 * Astryx surface rendered underneath (selectors, popovers, checkbox lists).
 * Wrap the region that renders Astryx primitives with this component.
 */
export function AstryxScope({ children }: { children: React.ReactNode }) {
  return (
    <div data-astryx-theme="neutral" className="adlabs-astryx">
      {children}
    </div>
  );
}
