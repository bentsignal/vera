import { defineComponent } from "convex/server";

// A local copy of the Better Auth Component, so its schema can include the
// passkey table that the packaged Component lacks.
const component = defineComponent("betterAuth");

export default component;
