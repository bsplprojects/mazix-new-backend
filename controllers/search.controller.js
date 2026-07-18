export async function fetchSearchResults(req, res) {
  try {
    const { q } = req.query;
    return res.status(200).json({
      success: true,
      message: "Fetched Successfully",
      data: [],
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
}
