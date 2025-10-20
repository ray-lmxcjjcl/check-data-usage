import { json } from '@shopify/remix-oxygen';
import { useLoaderData } from '@remix-run/react';
// 确保您已经创建了 src/constants/index.js 文件
import {
  MICROESIM_ACCOUNT_ID,
  MICROESIM_SALT,
  MICROESIM_SECRET_KEY,
  PRODUCTION_API_URL,
} from '~/constants'; 
import * as crypto from 'crypto';

// 假设使用的 API 路径是 /api/v1/esim/deviceDetail，您可能需要根据文档调整
const DEVICE_DETAIL_PATH = '/ali/esim/v1/deviceDetail';

// 1. Server-side Loader 函数 (处理签名和 API 调用)
export async function loader({ request, context }) {
  // 检查是否已设置所有必要的环境变量 (这些变量从 MiniOxygen 或 Oxygen 部署环境获取)
  if (!MICROESIM_ACCOUNT_ID || !MICROESIM_SALT || !MICROESIM_SECRET_KEY || !PRODUCTION_API_URL) {
    return json(
      {
        data: null,
        error: 'Environment variables (Keys/Salt/URL) are missing in MiniOxygen/Oxygen.',
        status: 500,
      },
      { status: 500 },
    );
  }

  // 1.1 从请求 URL 中获取 ICCID 参数 (例如: /usage?iccid=89852342022319441027)
  const url = new URL(request.url);
  const iccid = url.searchParams.get('iccid'); // **从 URL 中获取 'iccid' 参数**

  if (!iccid) {
    // 如果没有 ICCID 参数，返回一个空结果，让 UI 渲染提示
    return json({ data: null, error: null, iccid: null });
  }

  // 2. 鉴权参数生成 (遵循 API 文档要求)
  
  // TIMESTAMP (seconds), 13 digits long, 实际上是毫秒级
  const timestamp = Date.now().toString(); 
  // NONCE: 6-32 字符的随机字符串
  const nonce = crypto.randomBytes(16).toString('hex'); 

  // 2.1 生成哈希密码 (Hashed Password)
  // **注意**: 1000 和 32 是推测值，必须联系供应商确认 PBKDF2 的迭代次数和密钥长度
  const hashedPassword = crypto
    .pbkdf2Sync(
      MICROESIM_SECRET_KEY, 
      MICROESIM_SALT, 
      1000,   // 迭代次数 (Iterations)
      32,     // 密钥长度 (Keylen in bytes)
      'sha256'
    )
    .toString('hex');
  
  // 2.2 构造签名内容 (Signature Content)
  // 格式: MICROESIM-ACCOUNT,MICROESIM-NONCE,MICROESIM-TIMESTAMP
  const stringToSign = `${MICROESIM_ACCOUNT_ID},${nonce},${timestamp}`;

  // 2.3 生成最终签名 (MICROESIM-SIGN)
  const hmac = crypto.createHmac('sha256', hashedPassword);
  hmac.update(stringToSign);
  const signature = hmac.digest('hex'); // 最终签名

  // 3. API 请求
  const apiUrl = `${PRODUCTION_API_URL}${DEVICE_DETAIL_PATH}`;
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'MICROESIM-ACCOUNT': MICROESIM_ACCOUNT_ID,
        'MICROESIM-NONCE': nonce,
        'MICROESIM-TIMESTAMP': timestamp, // 注意：这里使用字符串形式
        'MICROESIM-SIGN': signature,
      },
      body: JSON.stringify({
        iccid: iccid, // **API 请求体中使用 'iccid' 参数**
      }),
    });

    const result = await response.json();

    if (response.ok) {
      return json({ data: result, iccid: iccid }, { status: 200 });
    } else {
      // API 返回错误，例如 4xx 或 5xx 错误
      return json(
        { 
          data: null,
          error: result.message || `Third-party API request failed with status: ${response.status}`, 
          iccid: iccid,
          apiResponse: result,
        },
        { status: response.status }
      );
    }
  } catch (error) {
    // 网络或其他请求错误
    console.error('API Fetch Error:', error);
    return json(
      {
        data: null,
        error: `Network or internal server error: ${error.message}`,
        iccid: iccid,
      },
      { status: 500 },
    );
  }
}

// 2. 页面组件 (用于展示数据)
export default function Usage() {
  // 获取 loader 函数返回的数据
  const { data, error, iccid, apiResponse } = useLoaderData();

  // 如果发生查询错误
  if (error && iccid) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-lg w-full">
          <h1 className="text-xl font-bold mb-4 text-red-600">eSIM 查询错误 (ICCID: {iccid})</h1>
          <p className="text-gray-700 break-words">**错误信息:** {error}</p>
          {apiResponse && (
             <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="font-semibold text-gray-800">API 响应详情:</p>
                <pre className="mt-2 p-2 bg-gray-50 border rounded text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(apiResponse, null, 2)}</pre>
             </div>
          )}
        </div>
      </div>
    );
  }
  
  // 如果查询成功
  if (data && iccid) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-lg w-full">
          <h1 className="text-xl font-bold mb-4 text-green-600">数据查询成功 (ICCID: {iccid})</h1>
          <p className="text-gray-600">设备详情和流量使用情况:</p>
          <pre className="mt-4 p-4 bg-gray-50 border rounded overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  // 默认展示 (未输入 ICCID 或查询参数)
  return (
    <div className="flex justify-center items-center h-screen bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-lg w-full">
        <h1 className="text-2xl font-bold mb-4">eSIM 设备流量查询页面</h1>
        <p className="text-gray-600">请在浏览器地址栏中添加 `?iccid=您的ICCID号码` 参数进行查询。</p>
        <p className="mt-2 text-sm text-gray-500">
          **示例:** `/usage?iccid=89852342022319441027`
        </p>
      </div>
    </div>
  );
}