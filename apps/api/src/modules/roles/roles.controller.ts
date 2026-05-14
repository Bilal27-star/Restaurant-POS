import type { RolesService } from "./roles.service.js";

/** HTTP adapter for roles. */
export class RolesController {
  constructor(private readonly service: RolesService) {}
}
