export interface ErrorMessage {
	code: String | null;
	title: String;
	messageLines: String[];
}

export interface OpenAIErrorResponse {
	error: {
		message: string,
		type: string,
		param: string,
		code: string
	};
}