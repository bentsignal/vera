import { z } from "zod";

import { internal } from "../../_generated/api";
import { createTool } from "../../agent/tools";
import { env } from "../../convex.env";
import { tryCatch } from "../../lib/utils";

const weatherArgs = z.object({
  location: z
    .string()
    .min(1)
    .max(300)
    .describe(
      `The location to get the weather for. Specify as city name, state code (only
      for the US) and country code divided by comma. Please use ISO 3166 country
      codes.`,
    ),
  queryType: z
    .enum([
      "current-conditions",
      "daily-forecast",
      "hourly-forecast",
      "last-24-hours",
    ])
    .describe("The type of weather query to make"),
  days: z
    .number()
    .min(1)
    .max(10)
    .default(1)
    .describe("The number of days to get the weather for."),
  unitSystem: z.enum(["METRIC", "IMPERIAL"]).describe(
    `If the location for the weather uses the metric system, present the temperature
    in Celsius. If the location for the weather uses the imperial system, present the
    temperature in Fahrenheit.`,
  ),
});
type WeatherInput = z.infer<typeof weatherArgs>;

type QueryType = WeatherInput["queryType"];

interface Coordinates {
  lat: number;
  lng: number;
}

const geocodingResultSchema = z.object({
  geometry: z.object({
    location: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
  }),
});
const geocodingResponseSchema = z.object({
  results: z.array(geocodingResultSchema).nonempty(),
});

function buildWeatherUrl(
  queryType: QueryType,
  coordinates: Coordinates,
  args: WeatherInput,
) {
  const base = "https://weather.googleapis.com";
  const shared = `key=${env.GOOGLE_API_KEY}&location.latitude=${coordinates.lat}&location.longitude=${coordinates.lng}&unitsSystem=${args.unitSystem}`;
  switch (queryType) {
    case "current-conditions":
      return `${base}/v1/currentConditions:lookup?${shared}`;
    case "daily-forecast":
      return `${base}/v1/forecast/days:lookup?${shared}&days=${args.days}&pageSize=${args.days}`;
    case "hourly-forecast":
      return `${base}/v1/forecast/hours:lookup?${shared}&hours=24&pageSize=24`;
    case "last-24-hours":
      return `${base}/v1/history/hours:lookup?${shared}&hours=${24}&pageSize=${24}`;
  }
}

async function getCoordinates(location: string) {
  const geocodingResponse = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${location}&key=${env.GOOGLE_API_KEY}`,
  );
  const parsed = geocodingResponseSchema.parse(await geocodingResponse.json());
  return parsed.results[0].geometry.location;
}

async function getWeather(url: string) {
  const weatherResponse = await fetch(url);
  const data = z.unknown().parse(await weatherResponse.json());
  return data;
}

export const weather = createTool({
  description: `

  This tool is used to get the current weather for a given location. It can be
  used to gather the current weather conditions, the upcoming day by day
  forecast (up to 10 days), the upcoming hourly forecast (up to 1 day of
  hourly data), or the last 24 hours of weather data.

  Use the data returned to create an informed and helpful response to address the
  user's question directly.

  `,
  inputSchema: weatherArgs,
  execute: async (ctx, args) => {
    const { data: coordinates, error: coordinatesError } = await tryCatch(
      getCoordinates(args.location),
    );
    if (coordinatesError) {
      console.error(
        "Error during weather tool call: Coordinates error",
        coordinatesError,
      );
      return null;
    }

    const url = buildWeatherUrl(args.queryType, coordinates, args);

    // get weather data
    const { data: weatherData, error: weatherError } = await tryCatch(
      getWeather(url),
    );
    if (weatherError) {
      console.error(
        "Error during weather tool call: Weather data retrieval error",
        weatherError,
      );
      return null;
    }

    // log usage
    if (ctx.userId) {
      await ctx.runMutation(internal.user.usage.log, {
        userId: ctx.userId,
        cost: 0.01,
        type: "tool_call",
      });
    }

    return weatherData;
  },
});
