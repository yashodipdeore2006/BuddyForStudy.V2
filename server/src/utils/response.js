export function success(res, data = {}, message = "Operation successful", status = 200) {
  return res.status(status).json({
    success: true,
    message,
    ...data
  });
}

export function failure(res, message, status = 400, errors) {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
}
