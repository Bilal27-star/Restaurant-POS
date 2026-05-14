import { RolesRepository } from "./roles.repository.js";

/** Application services for roles. */
export class RolesService {
  constructor(private readonly repository: RolesRepository) {}
}
