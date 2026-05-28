export function getRestaurantId(): string {
  return process.env.NEXT_PUBLIC_RESTAURANT_ID ?? "molenbeek";
}
