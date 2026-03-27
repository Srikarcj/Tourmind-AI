import { env } from "../config/env.js";
import { dbQuery } from "../lib/db.js";

const normalizeEmail = email => {
  const value = String(email || "").trim();
  return value || null;
};

const toRoleFromEmail = email => {
  if (!email) {
    return null;
  }

  return email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase() ? "admin" : "user";
};

export const upsertUserProfile = async ({ id, email, name }) => {
  const safeEmail = normalizeEmail(email);
  const role = toRoleFromEmail(safeEmail);

  const result = await dbQuery(
    `
    INSERT INTO users (id, email, name, role)
    VALUES ($1::uuid, $2, $3, COALESCE($4, 'user'))
    ON CONFLICT (id)
    DO UPDATE SET
      email = COALESCE(EXCLUDED.email, users.email),
      name = COALESCE(EXCLUDED.name, users.name),
      role = COALESCE(EXCLUDED.role, users.role, 'user')
    RETURNING id, email, name, role
    `,
    [id, safeEmail, name || null, role]
  );

  return result.rows[0];
};
