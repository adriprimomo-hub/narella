import { NextResponse } from "next/server"
import { z } from "zod"

const toIssue = (issue: z.ZodIssue) => ({
  path: issue.path.join("."),
  message: issue.message,
})

export const parseJsonBody = async (request: Request) => {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export const validateBody = async <T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  options?: { allowEmpty?: boolean },
) => {
  const payload = await parseJsonBody(request)
  const value = payload ?? (options?.allowEmpty ? {} : null)
  const result = schema.safeParse(value)
  if (!result.success) {
    return {
      data: null,
      response: NextResponse.json(
        {
          error: "Validation error",
          details: result.error.issues.map(toIssue),
        },
        { status: 400 },
      ),
    }
  }

  return { data: result.data as z.infer<T>, response: null }
}
