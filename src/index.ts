import { getInput, info, setFailed } from '@actions/core';
import { getOctokit, context } from '@actions/github';
import sodium from 'libsodium-wrappers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPublicKey(octokit: any, owner: string, repo: string) {
  const { data: keyData } = await octokit.request('GET /repos/{owner}/{repo}/actions/secrets/public-key', {
    owner,
    repo,
    headers: {
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })
  return keyData;
}

const addOrUpdateSecret = async (secretName: string, secretValue: string) => {
  const myToken = getInput('GITHUB_TOKEN');
  const octokit = getOctokit(myToken);
  const { owner, repo } = context.repo;

  try {
    await sodium.ready;
    const keyData = await getPublicKey(octokit, owner, repo);
    const binkey = sodium.from_base64(
      keyData.key,
      sodium.base64_variants.ORIGINAL
    );
    const binsec = sodium.from_string(secretValue);
    const encBytes = sodium.crypto_box_seal(binsec, binkey);
    const output = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);

    await octokit.request(
      'PUT /repos/{owner}/{repo}/actions/secrets/{secret_name}',
      {
        owner,
        repo,
        secret_name: secretName,
        encrypted_value: output,
        key_id: keyData.key_id,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );
    info(`✅ Secret "${secretName}" added or updated successfully.`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    setFailed(`❌ Error adding secret "${secretName}": ${err.message}`);
  }
};

const addOrUpdateVariable = async (
  variableName: string,
  variableValue: string
) => {
  const myToken = getInput('GITHUB_TOKEN');
  const octokit = getOctokit(myToken);
  const { owner, repo } = context.repo;

  try {
    await octokit.request(
      'GET /repos/{owner}/{repo}/actions/variables/{name}',
      {
        owner,
        repo,
        name: variableName,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    info(`🔄 Variable "${variableName}" exists. Updating value...`);
    await octokit.request(
      'PATCH /repos/{owner}/{repo}/actions/variables/{name}',
      {
        owner,
        repo,
        name: variableName,
        value: variableValue,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );
    info(`✅ Variable "${variableName}" updated successfully.`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err.status === 404) {
      info(
        `🔍 Variable "${variableName}" does not exist. Creating variable...`
      );
      try {
        await octokit.request('POST /repos/{owner}/{repo}/actions/variables', {
          owner,
          repo,
          name: variableName,
          value: variableValue,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });
        info(`✅ Variable "${variableName}" created successfully.`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (createErr: any) {
        setFailed(
          `❌ Error creating variable "${variableName}": ${createErr.message}`
        );
      }
    } else {
      setFailed(
        `❌ Error retrieving variable "${variableName}": ${err.message}`
      );
    }
  }
};

const main = async () => {
  try {
    const typeToUpdate = getInput('TYPE');
    const name = getInput('NAME');
    const value = getInput('VALUE');

    if (typeToUpdate === 'secret') {
      await addOrUpdateSecret(name, value);
    } else if (typeToUpdate === 'variable') {
      await addOrUpdateVariable(name, value);
    } else {
      throw new Error('Invalid update type. Must be "secret" or "variable".');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    setFailed(`❌ Error in main execution: ${err.message}`);
  }
};

try {
  info('🚀 Starting action...');
  main().then(() => {
    info('🎉 Action completed successfully.');
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} catch (err: any) {
  setFailed(`❌ Error running action: ${err.message}`);
}
