import { Message }             from "@/types/chat";
import { OpenAIErrorResponse } from "@/types/error";
import { OpenAIModel }         from "@/types/openai";
import KeyStore, { KeyType }   from "@/utils/server/KeyStore";

import { createParser, ParsedEvent, ReconnectInterval } from "eventsource-parser";

import {
	AZURE_DEPLOYMENT_ID,
	OPENAI_API_HOST,
	OPENAI_API_TYPE,
	OPENAI_API_VERSION,
	OPENAI_ORGANIZATION
} from "../app/const";

export class OpenAIError extends Error {
	type: string;
	param: string;
	code: string;
	
	constructor (error: OpenAIErrorResponse) {
		super(error.error.message);
		this.name = "OpenAIError";
		({type: this.type, param: this.param, code: this.code} = error.error);
	}
}

export const OpenAIStream = async (
	model: OpenAIModel,
	systemPrompt: string,
	temperature: number,
	key: string,
	messages: Message[]
): Promise<ReadableStream> => {
	const keyType = model.id === "gpt-4" ? KeyType.GPT4 : KeyType.GPT3;
	if (!key) key = await KeyStore.getKey(keyType);
	const res = await fetch(
		`${OPENAI_API_HOST}/${OPENAI_API_TYPE === "azure"
		                      ? `openai/deployments/${AZURE_DEPLOYMENT_ID}/chat/completions?api-version=${OPENAI_API_VERSION}`
		                      : "v1/chat/completions"}`, {
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
			},
			method : "POST",
			body   : JSON.stringify({
				                        ...(OPENAI_API_TYPE === "openai" && {model: model.id}),
				                        messages   : [
					                        {
						                        role   : "system",
						                        content: systemPrompt
					                        },
					                        ...messages
				                        ],
				                        max_tokens : 1000,
				                        temperature: temperature,
				                        stream     : true
			                        })
		});
	
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	
	if (res.status !== 200) {
		const result = await res.json();
		if (result.error) {
			const error = new OpenAIError(result);
			if (error.code === "invalid_api_key") {
				console.log(`Key ${key} was invalid. Removing it.`);
				await KeyStore.deleteKey(key);
				key = await KeyStore.getKey();
				return OpenAIStream(model, systemPrompt, temperature, key, messages);
			}
			throw error;
		} else {
			throw new Error(
				`OpenAI API returned an error: ${
					decoder.decode(result?.value) || result.statusText
				}`
			);
		}
	}
	
	const stream = new ReadableStream({
		                                  async start (controller) {
			                                  const onParse = (event: ParsedEvent | ReconnectInterval) => {
				                                  if (event.type === "event") {
					                                  const data = event.data;
					                                  
					                                  try {
						                                  const json = JSON.parse(data);
						                                  if (json.choices[0].finish_reason != null) {
							                                  controller.close();
							                                  return;
						                                  }
						                                  const text  = json.choices[0].delta.content;
						                                  const queue = encoder.encode(text);
						                                  controller.enqueue(queue);
					                                  } catch (e) {
						                                  controller.error(e);
					                                  }
				                                  }
			                                  };
			                                  
			                                  const parser = createParser(onParse);
			                                  
			                                  for await (const chunk of res.body as any) {
				                                  parser.feed(decoder.decode(chunk));
			                                  }
		                                  }
	                                  });
	
	return stream;
};
