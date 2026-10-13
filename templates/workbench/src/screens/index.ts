import type { ComponentType } from 'react';

// '<screen name as captured>': the screen's component. The build loop adds one line per screen it builds.
export const screens: Record<string, ComponentType> = {};
