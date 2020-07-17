const { GraphQLScalarType } = require("graphql");
const { authorizeWithGithub } = require("../lib");
const fetch = require("node-fetch");

let _id = 0;

const users = [
  {
    githubLogin: "mHattrup",
    name: "Mike Hattrup",
  },
  {
    githubLogin: "gPlake",
    name: "Glen Plake",
  },
  {
    githubLogin: "sSchmidt",
    name: "Scot Schmidt",
  },
];

const photos = [
  {
    id: "1",
    name: "Dropping the Heart Chute",
    description: "The heart chute is one of my favorit chutes",
    category: "ACTION",
    githubUser: "gPlake",
    created: "3-28-1977",
  },
  {
    id: "2",
    name: "Enjoying the sunshine",
    category: "SELFIE",
    githubUser: "sSchmidt",
    created: "1-2-1985",
  },
  {
    id: "3",
    name: "Gunbarrel 25",
    description: "25 laps on gunbarrel today",
    category: "LANDSCAPE",
    githubUser: "sSchmidt",
    created: "2018-04-15T19:09:57.308Z",
  },
];

const tags = [
  {
    photoID: "1",
    userID: "gPlake",
  },
  {
    photoID: "1",
    userID: "sSchmidt",
  },
  {
    photoID: "2",
    userID: "mHattrup",
  },
  {
    photoID: "2",
    userID: "gPlake",
  },
];

const githubAuth = async (parent, { code }, { db }) => {
  const {
    message,
    access_token,
    avatar_url,
    login,
    name,
  } = await authorizeWithGithub({
    client_id: "fa003ec24424518c4b3c",
    client_secret: "9ff15494be4771aa216163e4a08e306374c2a65a",
    code,
  });

  if (message) {
    throw new Error(message);
  }

  const latesUserInfo = {
    name,
    githubLogin: login,
    githubToken: access_token,
    avatar: avatar_url,
  };

  const {
    ops: [user],
  } = await db
    .collection("users")
    .replaceOne({ githubLogin: login }, latesUserInfo, { upsert: true });

  return { user, token: access_token };
};

const postPhoto = async (parent, args, { db, currentUser }) => {
  if (!currentUser) {
    throw new Error("only an authorized user can post a photo");
  }

  const newPhoto = {
    id: _id++,
    ...args.input,
    userID: currentUser.githubLogin,
    created: new Date(),
  };

  const { insertedIds } = await db.collection("photos").insert(newPhoto);
  newPhoto.id = insertedIds[0];
  return newPhoto;
};

const addFakeUsers = async (root, { count }, { db }) => {
  const randomUserApi = `https://randomuser.me/api/?result=${count}`;
  const { results } = await fetch(randomUserApi).then((res) => res.json());

  const users = results.map((r) => ({
    githubLogin: r.login.username,
    name: `${r.name.first} ${r.name.last}`,
    avatar: r.picture.thumbnail,
    githubToken: r.login.sha1,
  }));

  await db.collection("users").insert(users);

  return users;
};

const fakeUserAuth = async (parent, { githubLogin }, { db }) => {
  const user = await db.collection("users").findOne({ githubLogin });

  if (!user) {
    throw new Error(`Cannot find user with githubLogin "${githubLogin}"`);
  }

  return {
    token: user.githubToken,
    user,
  };
};

const resolvers = {
  Query: {
    me: (parent, args, { currentUser }) => currentUser,
    totalPhotos: (parent, args, { db }) =>
      db.collection("photos").estimatedDocumentCount(),
    allPhotos: (parent, args, { db }) =>
      db.collection("photos").find().toArray(),
    totalUsers: (parent, args, { db }) =>
      db.collection("users").estimatedDocumentCount(),
    allUsers: (parent, args, { db }) => db.collection("users").find().toArray(),
  },

  Mutation: {
    postPhoto,
    githubAuth,
    addFakeUsers,
    fakeUserAuth,
  },

  Photo: {
    id: (parent) => parent.id || parent._id,
    url: (parent) => `/img/photos/${parent._id}.jpg`,
    postedBy: (parent) =>
      db.collection("users").findOne({ githubLogin: parent.userID }),
  },

  User: {
    postedPhotos: (parent) => {
      return photos.filter((p) => p.githubUser === parent.githubLogin);
    },
    inPhotos: (paremt) =>
      tags
        .filter((tag) => tag.userID === parent.id)
        .map((tag) => tag.photoID)
        .map((photoID) => photos.find((p) => p.id === photoID)),
  },

  DateTime: new GraphQLScalarType({
    name: "DateTime",
    description: "A valid date time value.",
    parseValue: (value) => new Date(value),
    serialize: (value) => new Date(value).toISOString(),
    parseLiteral: (ast) => ast.value,
  }),
};

module.exports = resolvers;
