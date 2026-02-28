import type { AuthenticatedRequestUser } from "../../domain/types";
import { AnalyticsRepository } from "../../infrastructure/repositories/analytics-repository";

export class AnalyticsService {
  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  getSummary(user: AuthenticatedRequestUser): any {
    return this.analyticsRepository.getSummary(user);
  }
}
