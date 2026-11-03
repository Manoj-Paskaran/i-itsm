import { NotFoundException } from './itsm-exception.js';
/** Raised when an admin edits a user, service, category or SLA policy that does not exist. */
export class ConfigItemNotFoundException extends NotFoundException {
  constructor(itemKind: string, id: string) {
    super('CONFIG_ITEM_NOT_FOUND', `${itemKind} ${id} was not found.`, { itemKind, id });
  }
}
