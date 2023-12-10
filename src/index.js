const core = require('@actions/core');
const { Octokit } = require("@octokit/core");

const githubToken = core.getInput('GITHUB_TOKEN', { required: true });
const openaiApiKey = core.getInput('OPENAI_API_KEY', { required: true });
const fantasyTheme = core.getInput('FANTASY_THEME', { required: false }) || 'wizard adventure';
const imageStyle = core.getInput('IMAGE_STYLE', { required: false }) || 'artistic';
const prNumber = core.getInput('PULL_REQUEST_NUMBER', { required: true });

const octokit = new Octokit({ auth: githubToken });

// Assuming these environment variables are set in your GitHub Actions workflow
// const owner = process.env.GITHUB_REPOSITORY_OWNER;
const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
console.log(`Owner: ${owner}, Repo: ${repo}`);

/**
 * Fetches comments or commit messages from a merged PR.
 * @param {number} prNumber - The number of the pull request.
 * @returns {Promise<string>} - A string vaguely related to PR content.
 */
async function fetchPRContent(prNumber) {
  try {
    // Fetch PR comments
    const { data: comments } = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner,
      repo,
      issue_number: prNumber
    });

    // Concatenate comments into a single string
    let commentsString = comments.map(comment => comment.body).join(' ');

    // Fetch PR commits
    const { data: commits } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/commits', {
      owner,
      repo,
      pull_number: prNumber
    });

    // Concatenate commit messages into a single string
    let commitMessagesString = commits.map(commit => commit.commit.message).join(' ');

    // Combine comments and commit messages
    let combinedString = commentsString + ' ' + commitMessagesString;

    return combinedString;
  } catch (error) {
    console.error('Error fetching PR content:', error);
    throw error;
  }
}

/**
 * Generates a fantasy-themed image based on PR content using OpenAI API.
 * @param {string} prompt - Prompt to base the image on.
 * @returns {Promise<string>} - URL of the generated image.
 */
async function generateImage(prompt) {
  const openAIEndpoint = 'https://api.openai.com/v1/images/generations';
  const apiKey = openaiApiKey;

  try {
    const payload = {
      prompt, // The content string derived from PR
      model: 'dall-e-3',
    };

    const response = await fetch(openAIEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    // console.log('Image generation response:\n', data);
    const imageUrl = data.data[0].url;

    return imageUrl;
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
}

/**
 * Queries the OpenAI API to generate a string image prompt based on the fantasy theme,
 * image style, and the content of the pull request.
 * @param {string} prContent - String of context discussed in the PR comments.
 * @returns {Promise<string>} - Image prompt suggested by AI for creating the fantasy image.
 */
async function createPrompt(prContent) {
    const openAIEndpoint = 'https://api.openai.com/v1/engines/gpt-3.5-turbo-instruct/completions';
    const apiKey = openaiApiKey;

    // Construct the input for the prompt
    const prompt = `Generate a creative image description for a fantasy-themed image. The theme is "${fantasyTheme}", the style is "${imageStyle}", and it should relate to the following pull request content: "${prContent}"`;
    const truncatedPrompt = prompt.substring(0, 1000);
    // console.log('MetaPrompt:\n', truncatedPrompt);

    try {
        const response = await fetch(openAIEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: truncatedPrompt,
                max_tokens: 200, // Adjust as necessary
                temperature: 0.7 // Adjust for creativity
            })
        });

        const data = await response.json();

        // Extract the generated prompt
        // console.log('Prompt generation response:\n', data);
        const generatedPrompt = data.choices[0].text.trim();
        // console.log('Prompt:\n', generatedPrompt);


        return generatedPrompt;
    } catch (error) {
        console.error('Error generating prompt with OpenAI:', error);
        throw error;
    }
}

/**
 * Posts the generated image URL as a comment on the PR with the prompt as alt text.
 * @param {number} prNumber - The number of the pull request.
 * @param {string} imageUrl - URL of the generated image.
 * @param {string} prompt - The prompt used to generate the image.
 */
async function postComment(prNumber, imageUrl, prompt) {
  try {
    // Construct the comment body with the image and its alt text
    const commentBody = `![${prompt.replaceAll('\n', '\\n')}](${imageUrl})`;

    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner,
      repo,
      issue_number: prNumber,
      body: commentBody
    });

    console.log('Comment posted successfully to PR #' + prNumber);
  } catch (error) {
    console.error('Error posting comment to the PR:', error);
    throw error;
  }
}

async function main() {
  try {

      if (!prNumber) {
        throw new Error('Pull Request number is not provided.');
      }

      // Fetch PR content
      const prContent = await fetchPRContent(prNumber);
      if (!prContent) {
        throw new Error('Failed to fetch content from the Pull Request.');
      }

      // Generate a prompt based on the PR content
      const imagePrompt = await createPrompt(prContent);
      if (!imagePrompt) {
        throw new Error('Failed to create a prompt for image generation.');
      }

      // Generate an image based on the created prompt
      const imageUrl = await generateImage(imagePrompt);
      if (!imageUrl) {
          throw new Error('Failed to generate an image.');
      }

      // Post the generated image URL as a comment on the PR
      await postComment(prNumber, imageUrl, imagePrompt);
      console.log('Image posted successfully.');

  } catch (error) {
      console.error('An error occurred in the main function:', error);
      process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
