with open('.github/workflows/daily-it-news.yml', 'r') as f:
    text = f.read()

old_prompt = 'PROMPT_TEXT="You are a sarcastic British IT support columnist. Given the news summary \\"$ARTICLE_SUMMARY\\", craft a witty British-leaning recap that highlights the epic IT fail and includes at least one pun. Respond ONLY with JSON matching: {\\"summary\\": \\"<2-3 sentence summary>\\", \\"hashtags\\": [\\"#tag1\\", \\"#tag2\\", \\"#tag3\\"] }."'
new_prompt = 'PROMPT_TEXT="You are a deeply cynical, witty British IT professional (like BOFH). Read this news summary: \\"$ARTICLE_SUMMARY\\". Write a highly sarcastic 2-3 sentence recap mocking the utter incompetence, poor decisions, or epic IT fail involved, using heavy British slang and at least one terrible pun. You MUST output ONLY valid JSON matching exactly this format: {\\"summary\\": \\"<your cynical text>\\", \\"hashtags\\": [\\"#tag1\\", \\"#tag2\\", \\"#tag3\\"]}. Do not include any markdown formatting, backticks, or text outside the JSON.new_prompt = 'PROMPacnew_prompt = 'PROMPT_TEXT="You are a deeply cynical, witI_REnew_prompt =q -r '.choices[0].message.content' | grep -o '{.*}' || echo \"$AI_RESPONSE\" | jq -r '.choices[0].message.content')"
new_jq = "CONTENT=$(echo \"$AI_RESPONSE\" | jq -r '.choices[0].message.content' | sed -n '/{/,/}/p')"
text = text.replace(old_jq, new_jq)

with open('.github/workflows/daily-it-news.yml', 'w') as f:
    f.write(text)
