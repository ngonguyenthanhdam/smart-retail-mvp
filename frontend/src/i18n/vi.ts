import { vi as operations } from './messages/operations';
import { vi as catalog } from './messages/catalog';
import { vi as inventory } from './messages/inventory';
import { vi as auth } from './messages/auth';
import { vi as shell } from './messages/shell';
import { vi as placeholder } from './messages/placeholder';
import { vi as notFound } from './messages/notFound';
import { vi as admin } from './messages/admin';
import { vi as locations } from './messages/locations';
import { vi as users } from './messages/users';
import { vi as sections } from './messages/sections';
import { vi as common } from './messages/common';
export const vi = {
  ...common,
  operations,
  catalog,
  inventory,
  auth,
  shell,
  placeholder,
  notFound,
  admin,
  locations,
  users,
  sections,
};
export { vi as importCopy } from './messages/importCopy';
export { vi as reportCopy } from './messages/reportCopy';
export { vi as forecastCopy } from './messages/forecastCopy';
export { vi as decisionCopy } from './messages/decisionCopy';
