interface ISiteMetadataResult {
  siteTitle: string;
  siteUrl: string;
  description: string;
  logo: string;
  navLinks: {
    name: string;
    url: string;
  }[];
}

const getBasePath = () => {
  const baseUrl = import.meta.env.BASE_URL;
  if (!baseUrl || baseUrl === '/') return '';
  return baseUrl.replace(/\/$/, '');
};

const data: ISiteMetadataResult = {
  siteTitle: 'Xunfeng 的运动',
  siteUrl: 'https://xunfeng-1.github.io',
  logo: `${import.meta.env.BASE_URL}images/favicon.png`,
  description: 'Xunfeng 的运动记录',
  navLinks: [
    {
      name: '总览',
      url: `${getBasePath()}/summary`,
    },
    {
      name: '主页',
      url: 'https://xunfeng-1.github.io',
    },
    {
      name: '仓库',
      url: 'https://github.com/Xunfeng-1/workouts',
    },
  ],
};

export default data;
