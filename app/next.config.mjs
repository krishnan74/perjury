/** @type {import('next').NextConfig} */
export default {
  // Chain and Graph credentials are read in server components only; nothing
  // here should ever reach the client bundle.
  env: {},
};
