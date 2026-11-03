import { NotFoundException } from './itsm-exception.js';
/** Raised when an incident references an unknown or inactive IT service. */
export class ServiceNotFoundException extends NotFoundException {
  constructor(serviceId: string) {
    super('SERVICE_NOT_FOUND', `Service ${serviceId} was not found.`, { serviceId });
  }
}
