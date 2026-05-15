import { dateTime } from "./date_time";
import { analyzeFiles } from "./files";
import { editImage, generateImage, initImage } from "./image";
import { currentEvents } from "./search/current_events";
import { positionHolder } from "./search/postition_holder";
import { weather } from "./weather";
import { getXUserPosts } from "./x/get_user_posts";
import { lookupXPost } from "./x/lookup_post";
import { lookupXUser } from "./x/lookup_user";
import { searchXPosts } from "./x/search_posts";
import { searchXPostsArchive } from "./x/search_posts_archive";

export const tools = {
  dateTime,
  currentEvents,
  weather,
  positionHolder,
  analyzeFiles,
  generateImage,
  initImage,
  editImage,
  searchXPosts,
  searchXPostsArchive,
  lookupXPost,
  lookupXUser,
  getXUserPosts,
};
