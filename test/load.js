import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 100, // Virtual Users
  duration: "30s",
};

export default function () {
  const res = http.get(
    "https://app.mymazix.com/api/v1/team/left/MAZ465922?limit=10&search=",
  );

  check(res, {
    "status is 200": (r) => r.status === 200,
  });

  sleep(1);
}
