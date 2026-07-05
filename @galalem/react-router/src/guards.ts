import { evaluateRoleExpression } from "./roleExpression";
import type { AuthConfig, Guard, GuardResult, RouteContext } from "./types";

const DEFAULT_REDIRECT_PARAM = "redirectUrl";

function buildLoginRedirect(
  configuration: AuthConfig,
  context: RouteContext,
): string {
  if (configuration.redirectParam === false) return configuration.loginPath;

  const parameterName = configuration.redirectParam ?? DEFAULT_REDIRECT_PARAM;
  const currentUrl = context.path + context.search + context.hash;
  const encoded = encodeURIComponent(currentUrl);
  const separator = configuration.loginPath.includes("?") ? "&" : "?";
  return `${configuration.loginPath}${separator}${parameterName}=${encoded}`;
}

export function authGuard(configuration: AuthConfig): Guard {
  return (context) => {
    const user = configuration.currentUser();
    if (user == null) return { redirect: buildLoginRedirect(configuration, context) };
    return true;
  };
}

export function rolesGuard(
  requiredRoles: string[],
  configuration: AuthConfig,
): Guard {
  return (context) => {
    const user = configuration.currentUser();
    if (user == null) return { redirect: buildLoginRedirect(configuration, context) };
    if (requiredRoles.length === 0) return true;

    if (!configuration.userRoles) {
      throw new Error(
        "rolesGuard requires AuthConfig.userRoles to extract roles from the current user.",
      );
    }

    const userRoles = configuration.userRoles(user);
    if (evaluateRoleExpression(requiredRoles, userRoles)) return true;
    return { deny: true };
  };
}

export async function runGuards(
  guards: Guard[],
  context: RouteContext,
): Promise<GuardResult> {
  for (const guard of guards) {
    const result = await guard(context);
    if (result !== true) return result;
  }
  return true;
}
