import { env } from "../config/env.js";
import { dbQuery } from "../lib/db.js";

export const upsertUserProfile = async ({ id, email, name }) => {
  const role = email && email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase() ? "admin" : "user";

  const result = await dbQuery(
    `
    INSERT INTO users (id, email, name, role)
    VALUES ($1::uuid, $2, $3, $4)
    ON CONFLICT (id)
    DO UPDATE SET
      email = EXCLUDED.email,
      name = COALESCE(EXCLUDED.name, users.name),
      role = EXCLUDED.role
    RETURNING id, email, name, role
    `,
    [id, email, name || null, role]
  );

  return result.rows[0];
};
