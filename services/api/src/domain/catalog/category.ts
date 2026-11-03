import { SkillTag, type CategoryId } from '../shared/index.js';
import { text, invalid } from '../shared/validation.js';
export interface CategorySnapshot {
  readonly id: CategoryId;
  readonly code: string;
  readonly name: string;
  readonly requiredSkill: string;
  readonly active: boolean;
}
/** Configurable incident category with its required skill. */
export class Category {
  private readonly categoryId: CategoryId;
  private readonly code: string;
  private categoryName: string;
  private readonly requiredSkill: SkillTag;
  private active: boolean;
  private constructor(s: CategorySnapshot) {
    this.categoryId = s.id;
    if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(s.code)) invalid('code', s.code);
    this.code = s.code;
    this.categoryName = text(s.name, 'name', 80);
    this.requiredSkill = SkillTag.of(s.requiredSkill);
    this.active = s.active;
  }
  static create(s: CategorySnapshot): Category {
    return new Category(s);
  }
  static rehydrate(s: CategorySnapshot): Category {
    return new Category(s);
  }
  id(): CategoryId {
    return this.categoryId;
  }
  name(): string {
    return this.categoryName;
  }
  skill(): SkillTag {
    return this.requiredSkill;
  }
  isActive(): boolean {
    return this.active;
  }
  rename(name: string): void {
    this.categoryName = text(name, 'name', 80);
  }
  deactivate(): void {
    this.active = false;
  }
  toSnapshot(): CategorySnapshot {
    return {
      id: this.categoryId,
      code: this.code,
      name: this.categoryName,
      requiredSkill: this.requiredSkill.value,
      active: this.active,
    };
  }
}
