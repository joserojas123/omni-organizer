import { PipeTransform, BadRequestException } from "@nestjs/common";
import { ZodSchema } from "zod";

/** Validates a request body/param against a zod schema from @omni-organize/shared. */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Validation failed",
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
