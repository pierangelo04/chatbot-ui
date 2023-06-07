import { OpenAIErrorResponse }                                                       from "@/types/error";
import { OpenAIModel, OpenAIModelID, OpenAIModels }                                  from "@/types/openai";
import { OPENAI_API_HOST, OPENAI_API_TYPE, OPENAI_API_VERSION, OPENAI_ORGANIZATION } from "@/utils/app/const";
import KeyStore                                                                      from "@/utils/server/KeyStore";

export const config = {
	runtime: "edge"
};

async function fetchModels (key: string): Promise<Response> {
	return await fetch(`${OPENAI_API_HOST}/${OPENAI_API_TYPE === "azure"
	                                         ? "openai/deployments?api-version=" + OPENAI_API_VERSION
	                                         : "v1/models"}`, {
		                   headers: {
			                   "Content-Type": "application/json",
			                   ...(OPENAI_API_TYPE === "openai" && {
				                   Authorization: `Bearer ${key}`
			                   }),
			                   ...(OPENAI_API_TYPE === "azure" && {
				                   "api-key": `${key}`
			                   }),
			                   ...((OPENAI_API_TYPE === "openai" && OPENAI_ORGANIZATION) && {
				                   "OpenAI-Organization": OPENAI_ORGANIZATION
			                   })
		                   }
	                   });
}
const handler = async (req: Request): Promise<Response> => {
	try {
		let {key} = (await req.json()) as {
			key: string;
		};
		
		if (!key) key = await KeyStore.getKey();
		let response = await fetchModels(key);
		while (process.env.OPENAI_API_KEY_SERVER
		       && response.status === 401
		       && (await response.json() as OpenAIErrorResponse).error.code === "invalid_api_key") {
			console.log(`Key ${key} was invalid. Removing it.`);
			await KeyStore.deleteKey(key);
			key      = await KeyStore.getKey();
			response = await fetchModels(key);
		}
		
		if (response.status === 401) {
			return new Response(response.body, {
				status : 500,
				headers: response.headers
			});
		} else if (response.status !== 200) {
			console.error(
				`OpenAI API returned an error ${
					response.status
				}: ${await response.text()}`
			);
			throw new Error("OpenAI API returned an error");
		}
		
		const json = await response.json();
		
		const models: OpenAIModel[] = json.data
		                                  .map((model: any) => {
			                                  const model_name = (OPENAI_API_TYPE === "azure") ? model.model : model.id;
			                                  for (const [key, value] of Object.entries(OpenAIModelID)) {
				                                  if (value === model_name) {
					                                  return {
						                                  id  : model.id,
						                                  name: OpenAIModels[value].name
					                                  };
				                                  }
			                                  }
		                                  })
		                                  .filter(Boolean);
		
		return new Response(JSON.stringify(models), {status: 200});
	} catch (error) {
		console.error(error);
		return new Response("Error", {status: 500});
	}
};

export default handler;
