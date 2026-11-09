import { en as operations } from './messages/operations';
import { en as catalog } from './messages/catalog';
import { en as inventory } from './messages/inventory';
import { en as auth } from './messages/auth';
import { en as shell } from './messages/shell';
import { en as placeholder } from './messages/placeholder';
import { en as notFound } from './messages/notFound';
import { en as admin } from './messages/admin';
import { en as locations } from './messages/locations';
import { en as users } from './messages/users';
import { en as sections } from './messages/sections';
import { en as common } from './messages/common';
export const en = {
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
export { en as importCopy } from './messages/importCopy';
export { en as reportCopy } from './messages/reportCopy';
export { en as forecastCopy } from './messages/forecastCopy';
export { en as decisionCopy } from './messages/decisionCopy';
